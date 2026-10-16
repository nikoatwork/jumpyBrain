// Transitional shell-test plumbing only. New browser logic belongs in typed modules.
export function extractShellFunction(script, name) {
  let start = script.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function " + name + " not found in browser shell");
  if (script.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  let depth = 0;
  for (let end = script.indexOf("{", start); end < script.length; end++) {
    if (script[end] === "{") depth++;
    if (script[end] === "}" && --depth === 0) return script.slice(start, end + 1);
  }
  throw new Error("Unterminated " + name);
}
