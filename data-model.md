QuickNotes Data Model
 
QuickNotes stores four kinds of data: **users**, their **notes**, **tags** to organise the notes, and a link table, **note_tags**, that says which tags are on which notes. The SQL in this document was run in SQLite and works as written. (For PostgreSQL, change `INTEGER PRIMARY KEY` to `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` so ids are created automatically.)
 
## Entities
 
### users
One row per registered person.
 
| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | INTEGER | Primary key | Identifies the user |
| `email` | VARCHAR(255) | | Required and unique. Used to log in |
| `password_hash` | VARCHAR(255) | | Required. A hash of the password, never the password itself |
| `display_name` | VARCHAR(100) | | Optional |
| `created_at` | TIMESTAMP | | Set automatically when the row is created |
 
### notes
One row per note.
 
| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | INTEGER | Primary key | Identifies the note |
| `user_id` | INTEGER | Foreign key to `users.id` | Required. The owner of the note |
| `title` | VARCHAR(100) | | Required, 1 to 100 characters (enforced by a `CHECK`) |
| `body` | TEXT | | Optional |
| `created_at` | TIMESTAMP | | Set automatically |
| `updated_at` | TIMESTAMP | | Set automatically, changed when the note is edited |
 
### tags
One row per tag. Each tag belongs to one user, so two users can both have a tag called "work" without clashing.
 
| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | INTEGER | Primary key | Identifies the tag |
| `user_id` | INTEGER | Foreign key to `users.id` | Required. The owner of the tag |
| `name` | VARCHAR(50) | | Required. Unique for each user (`UNIQUE (user_id, name)`) |
 
### note_tags
One row for each tag attached to a note.
 
| Column | Type | Key | Notes |
|---|---|---|---|
| `note_id` | INTEGER | Part of the primary key, foreign key to `notes.id` | Required |
| `tag_id` | INTEGER | Part of the primary key, foreign key to `tags.id` | Required |
 
The primary key is the pair (`note_id`, `tag_id`), so the same tag cannot be attached to the same note twice.
 
## Relationships
 
- **users to notes: one-to-many.** One user has many notes, and each note belongs to exactly one user.
- **users to tags: one-to-many.** One user has many tags, and each tag belongs to exactly one user.
- **notes to tags: many-to-many.** One note can have many tags (a note can be both "work" and "urgent"), and one tag can be on many notes.
**Why `note_tags` is needed.** A table cannot hold a many-to-many relationship directly. Putting a list of tags inside each note row would break the one-value-per-column rule and make questions like "which notes have the tag work?" hard to answer. The `note_tags` join table turns the many-to-many relationship into two one-to-many relationships: one note has many `note_tags` rows, and one tag has many `note_tags` rows.
 
**Deleting.** The foreign keys use `ON DELETE CASCADE`. Deleting a user removes their notes and tags. Deleting a note removes its rows in `note_tags`, so `DELETE /notes/{id}` never leaves orphaned links behind. Deleting a tag removes the links to it but keeps the notes.
 
## CREATE TABLE statements
 
```sql
-- SQLite only: turns on foreign key checking
PRAGMA foreign_keys = ON;
 
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
 
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  title      VARCHAR(100) NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
 
CREATE TABLE tags (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name    VARCHAR(50) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);
 
CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);
```
 
The `CHECK` on `title` matters because SQLite does not enforce the length in `VARCHAR(100)`. The check makes the database enforce the same 1 to 100 character rule as the API, so a bug in the app cannot store a bad title.
 
## Indexes
 
```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags (tag_id);
```
 
**`idx_notes_user_created` on `notes (user_id, created_at)`**
- **Reason:** `GET /notes` is the most common request (about 8 reads for every write in the load estimate). It asks for one user's notes, newest first. This index keeps each user's notes already sorted by date, so the database reads the first 10 entries instead of scanning every note and sorting them.
- **Cost:** a little extra storage, and inserts are slightly slower because the index is updated too. That is a good trade for the most-used query.
**`idx_note_tags_tag_id` on `note_tags (tag_id)`**
- **Reason:** the primary key (`note_id`, `tag_id`) is ordered by `note_id` first, so it makes "which tags are on this note?" fast but does not help with "which notes have this tag?". Queries that start from a tag, such as counting notes per tag or removing a tag, need to look up rows by `tag_id`. When this was tested in SQLite, the counting query used the index with the index in place and had to scan the whole `note_tags` table without it.
- **Cost:** the same small extra storage and slightly slower inserts.
The primary keys and the `UNIQUE` columns get indexes automatically, so `users.email` lookups at login are already fast.
 
## Example queries
 
These use the sample data below.
 
```sql
INSERT INTO users (id, email, password_hash, display_name) VALUES
  (1, 'amina@example.com', 'hash1', 'Amina'),
  (2, 'brian@example.com', 'hash2', 'Brian');
 
INSERT INTO notes (id, user_id, title, body, created_at) VALUES
  (1, 1, 'Buy groceries',     'Milk, bread and eggs',  '2026-10-20 08:00:00'),
  (2, 1, 'Project report',    'Send draft to Grace',   '2026-10-21 09:30:00'),
  (3, 1, 'Revise SQL joins',  'Chapter 5 exercises',   '2026-10-22 18:15:00'),
  (4, 2, 'Call the landlord', 'About the water bill',  '2026-10-22 07:45:00');
 
INSERT INTO tags (id, user_id, name) VALUES
  (1, 1, 'personal'), (2, 1, 'work'), (3, 1, 'study'), (4, 2, 'personal');
 
INSERT INTO note_tags (note_id, tag_id) VALUES
  (1, 1), (2, 2), (3, 3), (3, 2), (4, 4);
```
 
**Query 1: a user's newest notes (this is `GET /notes?page=1&limit=10`)**
 
```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;
```
 
| id | title | created_at |
|---|---|---|
| 3 | Revise SQL joins | 2026-10-22 18:15:00 |
| 2 | Project report | 2026-10-21 09:30:00 |
| 1 | Buy groceries | 2026-10-20 08:00:00 |
 
**Query 2: a user's notes with the tag "work" (this is `GET /notes?tag=work`), using a JOIN**
 
```sql
SELECT n.id, n.title, n.created_at
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t ON t.id = nt.tag_id
WHERE n.user_id = 1 AND t.name = 'work'
ORDER BY n.created_at DESC;
```
 
| id | title | created_at |
|---|---|---|
| 3 | Revise SQL joins | 2026-10-22 18:15:00 |
| 2 | Project report | 2026-10-21 09:30:00 |
 
**Query 3: how many notes each tag has (this feeds `GET /tags`)**
 
```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name
ORDER BY t.name;
```
 
| name | note_count |
|---|---|
| personal | 1 |
| study | 1 |
| work | 2 |
 
`LEFT JOIN` keeps tags that have no notes yet, and `COUNT(nt.note_id)` counts only real links, so an unused tag shows 0 instead of 1.
 
## SQL or NoSQL?
 
I would choose SQL, a relational database such as PostgreSQL. QuickNotes data is structured and connected: every note belongs to a user, and notes and tags link to each other many-to-many. A relational database can enforce those rules itself, with foreign keys that stop a note pointing at a user who does not exist, a unique rule that stops duplicate tags, and cascading deletes that stop orphaned links. The questions the app asks, such as a user's newest notes, the notes with a given tag, and the number of notes per tag, are joins and counts, which SQL is built for. The amount of data is also modest (a few hundred gigabytes a year for a million users, see the architecture document), so we do not need the huge horizontal scaling that is the main reason to pick NoSQL. A document database would suit notes better if each note were a free-form document with a different shape, but then renaming a tag or counting notes per tag would mean rewriting or scanning many documents.
 