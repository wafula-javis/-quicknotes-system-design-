# QuickNotes System Design
 
QuickNotes is a small note-taking service. This project has two parts: a simple **API client** (a web page that loads, adds and deletes notes by calling a REST API) and three **design documents** that describe how a real QuickNotes backend would be built, from its API and database to the architecture needed for 1 million users.
 
## What is in this repository
 
| File | What it is |
|---|---|
| `index.html`, `api.js`, `style.css` | The API client |
| `docs/api-design.md` | The REST API design |
| `docs/data-model.md` | The database design |
| `docs/architecture.md` | The system architecture |
 
## How to run the API client
 
1. Download or clone this repository.
2. Open `index.html` in a web browser (double-click it). You need an internet connection, because the page calls the JSONPlaceholder test API.
3. Click **Load notes** to load 10 notes. Use the form to add a note, and the **Delete** button on a note to remove it.
If the page does not load data when opened straight from the folder, start a small local server instead and open the address it prints:
 
```
python -m http.server 8000
```
 
then go to `http://localhost:8000`.
 
**Good to know:** JSONPlaceholder only pretends to save changes. Adding a note returns a fake id and deleting a note reports success, but nothing is really stored, so reloading the page and clicking **Load notes** again brings back the original 10 notes.
 
**To see the error message:** temporarily change `API_URL` at the top of `api.js` to a wrong address, reload the page and click **Load notes**. Then change it back.
 
## The design documents
 
- [API design](docs/api-design.md): eight REST endpoints, request and response examples, and the error codes.
- [Data model](docs/data-model.md): the users, notes, tags and note_tags tables, with SQL, an index and example queries.
- [Architecture](docs/architecture.md): requirements, a load estimate for 1 million users, the architecture diagram, request flows and trade-offs.
## What I learned
 
- Sending every request through one `request()` function that checks `response.ok` and throws means all errors can be handled the same way, with `try / catch / finally`, and the buttons can always be switched back on in `finally`.
- JSONPlaceholder gives every new note the same id (101), so the page cannot use that id to tell notes apart. I gave each note its own key on the page so that deleting one does not remove another.
- A many-to-many relationship, like notes and tags, needs a join table (`note_tags`), and `ON DELETE CASCADE` keeps that table tidy when a note is deleted.
- Putting numbers on a design changes it. The estimate showed QuickNotes is small (about 463 reads a second at peak and under half a terabyte a year), so the extra servers, replica and queue are there for availability, not because one server could not cope.
- Inserting user text with `textContent` instead of HTML means anything a user types is shown as plain text and never runs as code.
 