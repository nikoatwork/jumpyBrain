import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("generated CLI instructions preserve personal-save and explicit-wrapup authorization", async () => {
  const { outputText } = ts.transpileModule(await read('src/cli/instructions.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext } });
  const { agentInstructions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const text = agentInstructions();
  assert.match(text, /explicit remember request authorizes.*configured personal local brain/);
  assert.match(text, /Setup\/check alone authorizes no sample write/);
  assert.match(text, /Shared\/global\/team\/remote writes require explicit destination authorization/);
  assert.match(text, /Only when the user has authorized a session wrapup/);
  assert.match(text, /Remembering one fact does not authorize an additional session summary/);
  assert.doesNotMatch(text, /At session end, recall likely duplicates/);
  assert.match(text, /Do not estimate a likely year.*created_at.*updated_at/);
  assert.match(text, /year was not specified/);
});

// Guidance contracts protect the authorization boundary; they do not test a
// model's interpretation, host skill discovery, or server-side enforcement.
for (const file of ["skills/jumpybrain-memory/SKILL.md", "docs/agent-workflows.md"]) {
  test(`${file}: personal remember does not imply shared capture or automatic wrapup`, async () => {
    const text = await read(file);
    assert.match(text, /Remember that the community event is on 18 November/);
    assert.match(text, /authorizes saving that fact to the configured personal local/);
    assert.match(text, /machine-wide.*--scope global/i);
    assert.match(text, /(?:Setup or an installation check alone|Setup\/check requests) authorize[sd]? no sample (?:memory|note)/);
    assert.match(text, /Shared\/global\/team\/remote destinations require explicit destination authorization/);
    assert.match(text, /even (?:if physically stored|when hosted) on this machine/);
    assert.match(text, /remember (?:one fact|one fact does not authorize)/);
    assert.match(text, /does not authorize an (?:additional|extra) session summary/);
    assert.match(text, /(?:Do not capture spontaneously|do not authorize spontaneous capture)/);
    assert.doesNotMatch(text, /If durable findings[^\n]*then write strict Markdown sections/);
    assert.match(text, /Do not estimate a [“"]?likely[”"]? year.*created_at.*updated_at/);
    assert.match(text, /frontmatter already records writing time/i);
  });
}

test("entry guidance distinguishes file presence, host discovery and model activation", async () => {
  const workflows = await read("docs/agent-workflows.md");
  const skill = await read("skills/jumpybrain-memory/SKILL.md");
  assert.match(skill, /description: .*previously saved personal facts without naming jumpyBrain/);
  assert.match(workflows, /File generation, host discovery, and model activation are separate checks/);
  assert.match(workflows, /exit 0 alone does not prove a healthy setup/);
  assert.match(workflows, /Authentication failures block the real model test/);
  assert.match(workflows, /CLI-only remember\/recall test cannot establish Claude activation/);
  assert.match(workflows, /Do not reinstall or repeat a saved write merely because activation failed/);
  for (const link of ["install-for-agents.md", "install.md", "faq.md"]) {
    assert.match(workflows, new RegExp(link.replaceAll(".", "\\.")));
    await access(new URL(`../docs/${link}`, import.meta.url));
  }
});

test("Pi keeps personal-local and remote-team tool guidance separate", async () => {
  const pi = await read("integrations/pi/jumpybrain-memory.ts");
  assert.match(pi, /targetArgs: \(\) => \["--root", LOCAL_MEMORY_ROOT\]/);
  assert.match(pi, /prefix: "jumpybrain_global"/);
  assert.match(pi, /return \["--target-url", GLOBAL_MEMORY_URL\]/);
  assert.match(pi, /Do not treat ordinary approval to remember as approval to write global memory/);
  assert.match(pi, /Only when the user has authorized a session wrapup/);
  assert.match(pi, /Setup\/check alone authorizes no sample write/);
  assert.match(pi, /remembering one fact do not authorize an additional session summary/);
  assert.match(pi, /do not auto-write global wrapups at session end/);
  assert.match(pi, /Do not estimate a likely year.*created_at.*updated_at/);
});
