import type { ExtensionContext, ExtensionCreateInput, ExtensionCreateResult, ExtensionUpdateResult, ExtensionTheme, ExtensionThemeRole } from '../../extensions.js';
import { EXTENSION_THEME_ROLES } from '../../extensions.js';

// The caller persists this input/key before invoking; this function never retries.
export async function createConfirmedNote(context: ExtensionContext, input: ExtensionCreateInput): Promise<string> {
  let saved: ExtensionCreateResult;
  try { saved = await context.memory.create(input); }
  catch { return 'Creation is unconfirmed. Keep the original key and reconcile before trying again.'; }
  if (saved.saved === true && saved.indexing.status === 'failed') return `Saved ${saved.id}; indexing failed. Refresh the same brain index; do not recreate.`;
  return `Saved ${saved.id}; indexing ${saved.indexing.status}.`;
}
export function updateMessage(result: ExtensionUpdateResult): string {
  return result.unchanged === true ? 'Unchanged' : `Updated ${result.id}; indexing ${result.indexed ? 'complete' : 'pending'}.`;
}
const role: ExtensionThemeRole = EXTENSION_THEME_ROLES[0];
const theme: ExtensionTheme = { id: 'typed', name: 'Typed', appearance: 'light', colors: { [role]: '#fff', '--surface': '#fff' } };
// @ts-expect-error private CSS properties are not semantic roles
const bad: ExtensionTheme = { id: 'bad', name: 'Bad', appearance: 'light', colors: { position: '#fff' } };
void [theme, bad];
