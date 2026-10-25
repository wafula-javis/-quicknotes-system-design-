 QuickNotes API Design
 
This document describes the REST API a real QuickNotes backend would offer. (The API client in this repository talks to the JSONPlaceholder test API instead, because QuickNotes has no real server yet.)
 
## Conventions
 
- **Base URL (example):** `https://api.quicknotes.example/v1`
- **Format:** requests and responses are JSON. Timestamps use ISO 8601 in UTC, for example `2026-10-23T09:30:00Z`.
- **Resources are plural nouns** (`/notes`, `/tags`), and the HTTP method says what to do with them.
- **Authentication:** every `/notes` and `/tags` request must send the header `Authorization: Bearer <access_token>`. The token comes from `POST /auth/login`.
- **Ownership:** a user can only see and change their own notes and tags. The user is identified from the token, so no endpoint takes a user id.
## Endpoints
 
| # | Method | Path | Description | Success status |
|---|---|---|---|---|
| 1 | POST | `/users` | Register a new account | `201 Created` |
| 2 | POST | `/auth/login` | Log in and receive an access token | `200 OK` |
| 3 | GET | `/notes` | List the logged-in user's notes (newest first) | `200 OK` |
| 4 | GET | `/notes/{id}` | Get one note | `200 OK` |
| 5 | POST | `/notes` | Create a note | `201 Created` |
| 6 | PUT | `/notes/{id}` | Replace a note's title, body and tags | `200 OK` |
| 7 | DELETE | `/notes/{id}` | Delete a note | `204 No Content` |
| 8 | GET | `/tags` | List the user's tags | `200 OK` |
 
**Query parameters for `GET /notes`**
- `tag` - only return notes with this tag, for example `?tag=work`
- `page` - which page of results to return (default `1`)
- `limit` - notes per page (default `10`, maximum `50`)
**Rules for a note**
- `title` is required and must be 1 to 100 characters.
- `body` is optional text.
- `tags` is an optional list of tag names. A tag that does not exist yet is created automatically.
## Example: create a note
 
`POST /notes`
 
Request body:
 
```json
{
  "title": "Buy groceries",
  "body": "Milk, bread and eggs",
  "tags": ["personal", "shopping"]
}
```
 
Response: `201 Created`, with the header `Location: /notes/42`
 
```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, bread and eggs",
  "tags": ["personal", "shopping"],
  "created_at": "2026-10-23T09:30:00Z",
  "updated_at": "2026-10-23T09:30:00Z"
}
```
 
## Example: list notes
 
`GET /notes?page=1&limit=2`
 
Response: `200 OK`
 
```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy groceries",
      "body": "Milk, bread and eggs",
      "tags": ["personal", "shopping"],
      "created_at": "2026-10-23T09:30:00Z",
      "updated_at": "2026-10-23T09:30:00Z"
    },
    {
      "id": 41,
      "title": "Revise SQL joins",
      "body": "Chapter 5 exercises",
      "tags": ["study"],
      "created_at": "2026-10-22T18:15:00Z",
      "updated_at": "2026-10-22T18:15:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 25
}
```
 
## Error status codes
 
Every error uses the same body shape, so a client can always handle failures the same way.
 
```json
{
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "title must be between 1 and 100 characters"
  }
}
```
 
| Status | Meaning | Example of when it happens |
|---|---|---|
| `400 Bad Request` | The request is not valid | `POST /notes` with an empty title, a title over 100 characters, or JSON that cannot be read |
| `401 Unauthorized` | The user is not logged in | `GET /notes` with no `Authorization` header, or with an expired token |
| `403 Forbidden` | Logged in, but not allowed to do this | `DELETE /notes/7` when note 7 belongs to a different user |
| `404 Not Found` | That resource does not exist | `GET /notes/9999` when there is no note 9999 |
| `500 Internal Server Error` | The server failed unexpectedly | `GET /notes` while the database is unreachable. The body says only "Something went wrong" and never includes internal details |
 
Also used: `409 Conflict` when `POST /users` is called with an email that is already registered.
 
**Design notes**
- Creating returns `201` with a `Location` header, and deleting returns `204` with no body, because there is nothing left to show.
- Using `PUT` means the whole note is replaced, so the request must include the title.
- For another user's note, this API returns `403`. Some APIs return `404` instead so that a stranger cannot even tell the note exists. We chose `403` because it is clearer for the client.
 