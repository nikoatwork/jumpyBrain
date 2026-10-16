import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { nextReleaseVersion, releaseOptions } from "../scripts/release-policy.mjs";

test("patch is default, minor is explicit, all major entrypoints require approval", () => {
  assert.equal(nextReleaseVersion("0.3.0"), "0.3.1");
  assert.equal(nextReleaseVersion("0.3.9", "minor"), "0.4.0");
  for (const bump of ["major", "1.0.0", "2.0.0"]) assert.throws(() => nextReleaseVersion("0.3.0", bump), /explicit user approval/);
  assert.equal(nextReleaseVersion("0.3.0", "major", true), "1.0.0");
  assert.throws(() => nextReleaseVersion("1.2.3", "major"), /approval/);
  for (const bump of ["0.3.0", "0.2.9", "01.0.0", "1.0.0-beta", "prerelease", "--force"]) assert.throws(() => nextReleaseVersion("0.3.0", bump));
  assert.deepEqual(releaseOptions([]), { bump: "patch", approveMajor: false, dryRun: false });
  assert.throws(() => releaseOptions(["patch", "minor"]), /extra/);
});

async function fixture(t, failTests = false, canPublish = true) {
  const root = await mkdtemp(path.join(tmpdir(), "jumpy-release-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts")); await mkdir(path.join(root, "bin"));
  for (const file of ["release.mjs", "release-policy.mjs"]) await copyFile(new URL(`../scripts/${file}`, import.meta.url), path.join(root, "scripts", file));
  await writeFile(path.join(root, "package.json"), JSON.stringify({version:"0.3.0"}));
  const mock = `#!${process.execPath}
const fs=require('fs'),path=require('path');
const command=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync('calls.jsonl',JSON.stringify([command,...args])+'\\n');
if(command==='git') {
 if(args[0]==='status' && fs.existsSync('bumped')) console.log(' M package.json\\n M package-lock.json');
 if(args[0]==='branch') console.log('master');
}
if(command==='gh' && args[0]==='repo') console.log('fixture/jumpybrain');
if(command==='gh' && args[0]==='api') console.log(process.env.CAN_PUBLISH);
if(command==='npm') {
 if(args[0]==='version') {fs.writeFileSync('bumped','yes');fs.writeFileSync('package.json',JSON.stringify({version:args[1]}));}
 if(args[0]==='test' && process.env.FAIL_TESTS==='1') process.exit(1);
 if(args[1]==='cli:pack') {fs.mkdirSync('.local-pack',{recursive:true});fs.writeFileSync('.local-pack/latest.json',JSON.stringify({tarballPath:path.resolve('.local-pack/fixture.tgz')}));}
}
`;
  for (const name of ["git","npm","gh"]) await writeFile(path.join(root,"bin",name),mock,{mode:0o755});
  const run = args => spawnSync(process.execPath,[path.join(root,"scripts/release.mjs"),...args],{cwd:root,encoding:"utf8",env:{...process.env,PATH:path.join(root,"bin")+path.delimiter+process.env.PATH,FAIL_TESTS:failTests?"1":"0",CAN_PUBLISH:canPublish?"true":"false"}});
  const calls = async () => (await readFile(path.join(root,"calls.jsonl"),"utf8")).trim().split("\n").map(JSON.parse);
  return {root,run,calls};
}

test("release validates before commit and atomically pushes branch/tag before beta publication", async t => {
  const f=await fixture(t); const result=f.run([]); assert.equal(result.status,0,result.stderr);
  const calls=await f.calls();
  assert.ok(calls.find(c=>c[0]==='npm'&&c[1]==='version'&&c[2]==='0.3.1'));
  const index=(tool,verb)=>calls.findIndex(c=>c[0]===tool&&c[1]===verb);
  assert.ok(index('npm','test')<index('git','commit'));
  const tagIndex=calls.findIndex(c=>c[0]==='git'&&c[1]==='tag'&&c[2]==='-a');
  assert.ok(index('git','commit')<tagIndex);
  assert.ok(tagIndex<index('git','push'));
  assert.deepEqual(calls.find(c=>c[0]==='git'&&c[1]==='push'),['git','push','--atomic','origin','HEAD:refs/heads/master','refs/tags/v0.3.1']);
  const published=calls.find(c=>c[0]==='gh'&&c[1]==='release');
  assert.ok(published.includes('--prerelease'));assert.ok(published.includes('--verify-tag'));
  assert.ok(index('git','push')<index('gh','release'));
});

test("failed validation cannot commit, tag or publish",async t=>{
  const f=await fixture(t,true);const result=f.run([]);assert.notEqual(result.status,0);
  const calls=await f.calls();
  assert.ok(!calls.some(c=>c[0]==='git'&&['commit','push'].includes(c[1])));
  assert.ok(!calls.some(c=>c[0]==='git'&&c[1]==='tag'&&c[2]==='-a'));
  assert.ok(!calls.some(c=>c[0]==='gh'&&c[1]==='release'));
});

test("release dry-run changes no version and publishes nothing",async t=>{
  const f=await fixture(t);assert.equal(f.run(['--dry-run']).status,0);
  assert.equal(JSON.parse(await readFile(path.join(f.root,'package.json'),'utf8')).version,'0.3.0');
  assert.ok(!(await f.calls()).some(c=>c[0]==='npm'||c[0]==='gh'||c[1]==='push'));
});

test("read-only GitHub authentication fails before bumping or publishing",async t=>{
  const f=await fixture(t,false,false);const result=f.run([]);assert.notEqual(result.status,0);
  assert.match(result.stderr,/account cannot publish/);
  assert.equal(JSON.parse(await readFile(path.join(f.root,'package.json'),'utf8')).version,'0.3.0');
  assert.ok(!(await f.calls()).some(c=>c[0]==='npm'||c[1]==='push'||c[1]==='commit'));
});
