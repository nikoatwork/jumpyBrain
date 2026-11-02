import assert from "node:assert/strict";
import test from "node:test";
import { collaborationFeedback } from "../dist/adapters/http-server/collaboration-feedback.js";

test("live editor feedback asks for an action without exposing internal errors", () => {
  const state = { status: "saved", dirty: false, durableDraft: true, message: "The edit sequence did not reproduce the local draft. /private/note.md" };
  for (const status of ["saved", "saving", "connecting", "offline", "readonly"]) {
    assert.equal(collaborationFeedback({ ...state, status }), "", `${status} needs no error toast`);
  }
  assert.equal(collaborationFeedback({ ...state, status: "conflict", dirty: true }), "Your changes haven't been saved. Choose Review changes to continue.");
  assert.equal(collaborationFeedback({ ...state, status: "blocked" }), "Reopen this note to continue.");
  assert.equal(collaborationFeedback({ ...state, status: "blocked", dirty: true }), "Copy your draft, then reopen this note to continue.");
  assert.equal(collaborationFeedback({ ...state, status: "offline", dirty: true, durableDraft: false }), "Keep this window open and copy your draft before reloading.");
});
