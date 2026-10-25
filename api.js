// api.js - QuickNotes API client
 
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTES_TO_LOAD = 10;
const MAX_TITLE_LENGTH = 100;
 
const loadBtn = document.querySelector("#load-btn");
const statusEl = document.querySelector("#status");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const notesList = document.querySelector("#notes-list");
 
// The notes currently shown. JSONPlaceholder only pretends to save changes,
// so this array is what the page treats as the truth after each request.
// Every note also gets its own `key`, because the fake API gives every new
// note the same id (101), which is no use for telling notes apart.
let notes = [];
let nextKey = 1;
let isBusy = false;
let deleteButtons = [];
 
// --- The one function every request goes through ---------------------------
 
// Calls fetch, checks response.ok and throws on errors, so every caller can
// handle failures in one way with try / catch.
async function request(url, options = {}) {
  const response = await fetch(url, options);
 
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
 
  return response.json();
}
 
// --- The three API calls ----------------------------------------------------
 
function getNotes() {
  return request(`${API_URL}?_limit=${NOTES_TO_LOAD}`);
}
 
function createNote(note) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
}
 
function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}
 
// --- Page states --------------------------------------------------------------
 
// type is "loading", "success" or "error", which picks the style in style.css.
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status-${type}`;
}
 
// Disables every button while a request is running, so nothing can be
// clicked twice or started on top of another request.
function setBusy(busy) {
  isBusy = busy;
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  deleteButtons.forEach((button) => {
    button.disabled = busy;
  });
}
 
function countText(count) {
  return count === 1 ? "1 note" : `${count} notes`;
}
 
// --- Rendering --------------------------------------------------------------------
 
// Rebuilds the whole list from the notes array. User text only ever goes in
// through textContent, so the browser treats it as plain text and never runs it as HTML.
function render() {
  notesList.textContent = "";
  deleteButtons = [];
 
  // Empty state
  if (notes.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "No notes to show. Load notes or add one.";
    notesList.appendChild(emptyItem);
    return;
  }
 
  notes.forEach((note) => {
    const item = document.createElement("li");
    item.className = "note-card";
 
    const title = document.createElement("h3");
    title.textContent = note.title;
    item.appendChild(title);
 
    const body = document.createElement("p");
    body.textContent = note.body;
    item.appendChild(body);
 
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "delete-btn";
    removeBtn.textContent = "Delete";
    removeBtn.disabled = isBusy;
    removeBtn.addEventListener("click", () => handleDelete(note.key));
    item.appendChild(removeBtn);
 
    deleteButtons.push(removeBtn);
    notesList.appendChild(item);
  });
}
 
// --- Validation -----------------------------------------------------------------------
 
// Returns an error message, or an empty string if the title is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return "";
}
 
// --- What happens when the user does something ---------------------------------
 
async function handleLoad() {
  setBusy(true);
  showStatus("Loading notes...", "loading");
 
  try {
    const posts = await getNotes();
    notes = posts.map((post) => ({
      key: nextKey++,
      id: post.id,
      title: post.title,
      body: post.body,
    }));
    render();
    showStatus(`Loaded ${countText(notes.length)}.`, "success");
  } catch (error) {
    console.error("Could not load notes:", error);
    showStatus("Could not load notes. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}
 
async function handleSubmit(event) {
  event.preventDefault();
 
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
 
  const problem = validateTitle(title);
  if (problem) {
    showStatus(problem, "error");
    return;
  }
 
  setBusy(true);
  showStatus("Adding note...", "loading");
 
  try {
    const created = await createNote({ title, body, userId: 1 });
    notes.unshift({
      key: nextKey++,
      id: created.id,
      title: created.title,
      body: created.body,
    });
    render();
    titleInput.value = "";
    bodyInput.value = "";
    showStatus("Note added.", "success");
  } catch (error) {
    console.error("Could not add note:", error);
    showStatus("Could not add the note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}
 
async function handleDelete(key) {
  const note = notes.find((item) => item.key === key);
  if (!note) {
    return;
  }
 
  setBusy(true);
  showStatus("Deleting note...", "loading");
 
  try {
    await deleteNote(note.id);
    notes = notes.filter((item) => item.key !== key);
    render();
    showStatus("Note deleted.", "success");
  } catch (error) {
    console.error("Could not delete note:", error);
    showStatus("Could not delete the note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}
 
// --- Start ------------------------------------------------------------------------------
 
loadBtn.addEventListener("click", handleLoad);
noteForm.addEventListener("submit", handleSubmit);
render(); // shows the empty state before anything is loaded
 