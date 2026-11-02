import type { CollaborationEditorState } from "./collaboration-editor.js";

/** User-facing actions only. Backend/editor messages may contain technical details. */
export function collaborationFeedback(state: Pick<CollaborationEditorState, "status" | "dirty" | "durableDraft">): string {
  if (!state.durableDraft) return "Keep this window open and copy your draft before reloading.";
  if (state.status === "conflict") return "Your changes haven't been saved. Choose Review changes to continue.";
  if (state.status === "blocked") return state.dirty
    ? "Copy your draft, then reopen this note to continue."
    : "Reopen this note to continue.";
  return "";
}
