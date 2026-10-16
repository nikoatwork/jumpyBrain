#!/usr/bin/env python3
"""Disposable filesystem/mock-native coverage: no installed app, launchd or memory."""
from contextlib import redirect_stdout, redirect_stderr
import fcntl
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install
import update
import uninstall


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jumpybrain-update-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.home = self.base / "home"
        self.root = self.home / ".jumpybrain"
        self.root.mkdir(parents=True)
        self.runtime = self.root / "app"
        self.stage = self.root / "app.installing"
        self.make_runtime(self.runtime, "old")
        self.make_runtime(self.stage, "new")
        self.manifest = {"version": 1, "installer": "jumpybrain-installer",
                         "installRoot": str(self.root), "appDir": str(self.runtime),
                         "binDir": str(self.root / "bin"), "cliPath": str(self.root / "bin/jumpybrain"),
                         "memoryRoot": str(self.base / "default-memory")}
        (self.root / "install-manifest.json").write_text(json.dumps(self.manifest))
        self.memory = self.base / "custom-memory"
        self.memory.mkdir()
        (self.memory / "jumpybrain.json").write_text('{"custom":true}\n')
        (self.memory / "notes.md").write_text("Canonical fixture content\n")
        self.support = self.base / "custom-support"
        self.support.mkdir()
        (self.support / "api-key").write_text("a" * 64 + "\n")
        (self.support / "companion.lock").touch()
        self.agent = self.home / "Library/LaunchAgents/local.jumpybrain.companion.plist"
        self.app = update.app_path(self.home)
        self.config = {"node": "/fixture/node", "qmd": "/fixture/qmd", "memoryRoot": str(self.memory),
                       "supportDirectory": str(self.support), "launchAgent": str(self.agent),
                       "runtimeRoot": str(self.runtime), "label": update.LABEL, "port": 4891,
                       "revision": "old", "futureSetting": {"preserve": True}}
        self.make_app(self.app, self.config)
        self.agent.parent.mkdir(parents=True)
        self.agent.write_bytes(plistlib.dumps(install.agent_plist(self.app, self.support)))
        (self.root / "cli-config.json").write_text('{"preserve":"remote policy"}\n')

    def make_runtime(self, path, version):
        (path / "dist").mkdir(parents=True)
        (path / "dist/cli.js").write_text(f"// {version}\n")
        (path / "package.json").write_text(json.dumps({"name": "jumpybrain", "version": version}))
        source = path / "integrations/macos-companion"
        source.mkdir(parents=True)
        (source / "Companion.swift").write_text(f"// {version} source\n")
        for helper in ("gateway.mjs", "connections.mjs", "switch-coordinator.mjs", "menu-update.mjs",
                       "update-check.mjs", "install.py", "update.py", "uninstall.py", "lifecycle.py"):
            (source / helper).write_text(f"// {version} {helper}\n")

    def make_app(self, path, config):
        (path / "Contents/Resources").mkdir(parents=True)
        (path / "Contents/MacOS").mkdir()
        (path / "Contents/MacOS/jumpyBrain").write_text("fixture executable\n")
        (path / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": update.LABEL,
                                                               "CFBundleExecutable": "jumpyBrain"}))
        (path / "Contents/Resources/Configuration.json").write_text(json.dumps(config))

    def write_config(self):
        (self.app / "Contents/Resources/Configuration.json").write_text(json.dumps(self.config))

    def fake_build(self, runtime, build, config, previous_app=None):
        self.assertEqual(previous_app, self.app)
        self.assertEqual(runtime, self.stage)
        self.assertEqual(config["runtimeRoot"], str(self.runtime))
        self.assert_locked()
        app = build / "jumpyBrain.app"
        self.make_app(app, dict(config, revision="new"))
        return app

    def assert_locked(self):
        with (self.support / "companion.lock").open() as lock:
            with self.assertRaises(BlockingIOError):
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def snapshot(self, root=None):
        root = root or self.base
        return {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}

    def helper(self, mode):
        with patch.object(sys, "argv", ["update.py", mode, "--install-root", str(self.root), "--home", str(self.home)]):
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                return update.main()


class PreflightTests(Fixture):
    def test_check_is_read_only(self):
        before = self.snapshot()
        lock_stat = (self.support / "companion.lock").stat()
        self.assertEqual(self.helper("--detect"), 0)
        self.assertEqual(self.helper("--check"), 0)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual((self.support / "companion.lock").stat().st_ino, lock_stat.st_ino)

    def test_missing_lock_fails_without_creating_it(self):
        (self.support / "companion.lock").unlink()
        before = self.snapshot()
        self.assertEqual(self.helper("--check"), 1)
        self.assertEqual(before, self.snapshot())

    def test_missing_support_is_not_created(self):
        shutil.rmtree(self.support)
        self.assertEqual(self.helper("--check"), 1)
        self.assertFalse(self.support.exists())

    def test_running_app_rejected_with_save_then_quit_message(self):
        with update.companion_lock(self.support):
            with self.assertRaisesRegex(update.SafetyError, "Saved.*Quit jumpyBrain"):
                with update.companion_lock(self.support):
                    pass
            self.assertEqual(self.helper("--check"), 1)
            # Ownership alone does not require the app to be stopped.
            self.assertEqual(self.helper("--detect"), 0)

    def test_custom_runtime_is_not_claimed(self):
        self.config["runtimeRoot"] = str(self.base / "other/app")
        self.write_config()
        self.assertEqual(self.helper("--detect"), 3)
        self.assertEqual(self.helper("--check"), 1)

    def test_bad_owned_config_is_not_silently_skipped(self):
        self.config["runtimeRoot"] = "relative/app"
        self.write_config()
        self.assertEqual(self.helper("--detect"), 1)

    def test_unrelated_bundle_is_not_claimed(self):
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "other.app"}))
        self.assertEqual(self.helper("--detect"), 3)

    def test_symlink_bundle_is_refused(self):
        moved = self.base / "other.app"
        self.app.rename(moved)
        self.app.symlink_to(moved)
        self.assertEqual(self.helper("--detect"), 1)

    def test_symlink_lock_is_refused(self):
        lock = self.support / "companion.lock"
        lock.unlink()
        lock.symlink_to(self.support / "api-key")
        self.assertEqual(self.helper("--check"), 1)

    def test_hardlinked_lock_is_refused(self):
        os.link(self.support / "companion.lock", self.support / "alias.lock")
        self.assertEqual(self.helper("--check"), 1)

    def test_bad_manifest_is_refused(self):
        self.manifest["appDir"] = str(self.stage)
        (self.root / "install-manifest.json").write_text(json.dumps(self.manifest))
        self.assertEqual(self.helper("--check"), 1)

    def test_bad_key_is_preserved_and_refused(self):
        (self.support / "api-key").write_text("invalid\n")
        before = self.snapshot()
        self.assertEqual(self.helper("--check"), 1)
        self.assertEqual(before, self.snapshot())

    def test_unrelated_launch_agent_refused(self):
        self.agent.write_bytes(plistlib.dumps({"Label": update.LABEL, "ProgramArguments": ["/unrelated"]}))
        self.assertEqual(self.helper("--check"), 1)

    def test_support_inside_runtime_refused(self):
        self.config["supportDirectory"] = str(self.runtime / "support")
        self.write_config()
        self.assertEqual(self.helper("--detect"), 1)

    def test_legacy_only_matches_default_install(self):
        del self.config["runtimeRoot"]
        self.write_config()
        snapshot = self.app / "Contents/Resources/runtime"
        shutil.copytree(self.runtime, snapshot)
        self.assertEqual(self.helper("--detect"), 0)
        with self.assertRaises(update.NotOwned):
            update.inspect_companion(self.base / "custom-install", self.home)


class UninstallTests(Fixture):
    def remove(self):
        absent = subprocess.CompletedProcess([], 113, "", f'Could not find service "{update.LABEL}"')
        with patch.object(uninstall.subprocess, "run", return_value=absent) as run:
            uninstall.remove_companion(self.root, self.home)
            run.assert_called_once()

    def test_custom_paths_and_broken_runtime_key_preserve_all_data(self):
        self.agent.unlink()
        self.agent = self.base / "custom-agent.plist"
        self.config["launchAgent"] = str(self.agent)
        self.write_config()
        self.agent.write_bytes(plistlib.dumps(install.agent_plist(self.app, self.support)))
        (self.support / "api-key").write_text("broken key")
        (self.support / "connections.json").write_text('{"activeId":"preserve"}')
        (self.support / "companion.log").write_text("preserve diagnostics")
        (self.memory / "index.sqlite").write_bytes(b"preserve derived state")
        (self.runtime / "dist/cli.js").unlink()
        before = {p: self.snapshot(p) for p in (self.memory, self.runtime, self.support)}
        self.remove()
        self.assertFalse(self.app.exists())
        self.assertFalse(self.agent.exists())
        for path, content in before.items():
            self.assertEqual(self.snapshot(path), content)

    def test_invalid_ownership_or_liveness_changes_nothing(self):
        def held():
            return update.companion_lock(self.support)
        cases = ("held", "missing", "symlink", "replaced", "unrelated-job", "unrelated-app")
        for case in cases:
            with self.subTest(case=case):
                # Each case restores itself; no mutation may precede validation.
                lock = self.support / "companion.lock"
                original_job = self.agent.read_bytes()
                original_info = (self.app / "Contents/Info.plist").read_bytes()
                if case == "missing": lock.unlink()
                if case == "symlink":
                    lock.unlink()
                    lock.symlink_to(self.support / "api-key")
                if case == "unrelated-job":
                    self.agent.write_bytes(plistlib.dumps({"Label": update.LABEL, "ProgramArguments": ["/unrelated"]}))
                if case == "unrelated-app":
                    (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "unrelated"}))
                before = self.snapshot()
                flock = fcntl.flock
                def replace(fd, operation):
                    result = flock(fd, operation)
                    lock.unlink()
                    lock.touch()
                    return result
                from contextlib import nullcontext
                with held() if case == "held" else nullcontext():
                    with patch.object(uninstall.subprocess, "run") as run:
                        with patch.object(fcntl, "flock", side_effect=replace) if case == "replaced" else nullcontext():
                            with self.assertRaises(update.SafetyError):
                                uninstall.remove_companion(self.root, self.home)
                        run.assert_not_called()
                self.assertEqual(self.snapshot(), before)
                if case in ("missing", "symlink"):
                    lock.unlink(missing_ok=True)
                    lock.touch()
                self.agent.write_bytes(original_job)
                (self.app / "Contents/Info.plist").write_bytes(original_info)

    def test_loaded_job_must_match_both_origin_and_executable(self):
        program = self.app / "Contents/MacOS/jumpyBrain"
        for missing_agent in (False, True):
            for origin, executable in ((self.agent, "/unrelated"), ("/other.plist", program)):
                with self.subTest(missing_agent=missing_agent, origin=origin, executable=executable):
                    if missing_agent:
                        self.agent.unlink(missing_ok=True)
                    before = self.snapshot()
                    output = f"job = {{\n\tpath = {origin}\n\tprogram = {executable}\n\ttype = LaunchAgent\n}}"
                    result = subprocess.CompletedProcess([], 0, output, "")
                    with patch.object(uninstall.subprocess, "run", return_value=result) as run:
                        with self.assertRaisesRegex(update.SafetyError, "loaded LaunchAgent"):
                            uninstall.remove_companion(self.root, self.home)
                        run.assert_called_once()
                    self.assertEqual(self.snapshot(), before)

    def test_owned_loaded_job_is_unloaded_before_deletion(self):
        output = f"job = {{\n\tpath = {self.agent}\n\tprogram = {self.app / 'Contents/MacOS/jumpyBrain'}\n\ttype = LaunchAgent\n}}"
        results = [subprocess.CompletedProcess([], 0, output, ""), subprocess.CompletedProcess([], 0)]
        with patch.object(uninstall.subprocess, "run", side_effect=results) as run:
            uninstall.remove_companion(self.root, self.home)
            self.assertEqual([call.args[0][1] for call in run.call_args_list], ["print", "bootout"])
        self.assertFalse(self.app.exists())

    def test_unknown_launchctl_error_or_unload_failure_preserves_everything(self):
        output = f"\tpath = {self.agent}\n\tprogram = {self.app / 'Contents/MacOS/jumpyBrain'}\n\ttype = LaunchAgent\n"
        for results in ([subprocess.CompletedProcess([], 1, "", "unknown failure")],
                        [subprocess.CompletedProcess([], 0, output, ""), subprocess.CompletedProcess([], 1)]):
            before = self.snapshot()
            with patch.object(uninstall.subprocess, "run", side_effect=results):
                with self.assertRaises(update.SafetyError):
                    uninstall.remove_companion(self.root, self.home)
            self.assertEqual(self.snapshot(), before)

    def test_legacy_owned_bundle_can_be_removed(self):
        del self.config["runtimeRoot"]
        self.write_config()
        shutil.copytree(self.runtime, self.app / "Contents/Resources/runtime")
        (self.app / "Contents/Resources/runtime/dist/cli.js").unlink()
        self.remove()
        self.assertTrue(self.memory.exists())
        self.assertTrue(self.runtime.exists())


class RuntimeClosureTests(Fixture):
    def test_gateway_and_lifecycle_dependencies_are_required_independently(self):
        source = self.stage / "integrations/macos-companion"
        for name in ("Companion.swift", "gateway.mjs", "connections.mjs", "switch-coordinator.mjs",
                     "menu-update.mjs", "update-check.mjs", "install.py", "update.py", "uninstall.py", "lifecycle.py"):
            with self.subTest(missing=name):
                dependency = source / name
                content = dependency.read_bytes()
                dependency.unlink()
                with self.assertRaisesRegex(update.SafetyError, name.replace(".", r"\.")):
                    update.validate_runtime(self.stage)
                dependency.write_bytes(content)
        update.validate_runtime(self.stage)
        self.assertFalse((source / "server-bootstrap.mjs").exists())


class TransactionTests(Fixture):
    def test_pair_commit_preserves_settings_key_login_memory_remote_and_lock(self):
        connections = self.support / "connections.json"
        connections.write_text('{"version":1,"credentialRef":"opaque-keychain-reference","activeId":"selected"}\n')
        connections.chmod(0o600)
        preserved = {p: p.read_bytes() for p in (connections, self.agent, self.support / "api-key", self.memory / "notes.md",
                                                self.memory / "jumpybrain.json", self.root / "cli-config.json",
                                                self.root / "install-manifest.json")}
        ino = (self.support / "companion.lock").stat().st_ino
        rename = os.rename

        def locked_rename(source, target):
            self.assert_locked()
            return rename(source, target)

        with patch.object(install, "build_app", side_effect=self.fake_build), patch.object(update.os, "rename", side_effect=locked_rename):
            update.commit(self.stage, self.root, self.home)
        config = update.inspect_companion(self.root, self.home)
        self.assertEqual(config, dict(self.config, revision="new"))
        self.assertEqual((self.runtime / "dist/cli.js").read_text(), "// new\n")
        self.assertFalse(self.stage.exists())
        for path, value in preserved.items():
            self.assertEqual(path.read_bytes(), value, path)
        self.assertEqual((self.support / "companion.lock").stat().st_ino, ino)
        with update.companion_lock(self.support):
            pass
        self.assertFalse(list(self.root.glob(".companion-*")))
        self.assertFalse(list(self.app.parent.glob(".companion-*")))

    def test_native_build_failure_changes_nothing(self):
        before = self.snapshot()
        with patch.object(install, "build_app", side_effect=subprocess.CalledProcessError(1, "swiftc")):
            with self.assertRaises(subprocess.CalledProcessError):
                update.commit(self.stage, self.root, self.home)
        self.assertEqual(before, self.snapshot())

    def test_running_refusal_precedes_build(self):
        with update.companion_lock(self.support), patch.object(install, "build_app") as build:
            with self.assertRaises(update.SafetyError):
                update.commit(self.stage, self.root, self.home)
            build.assert_not_called()

    def test_rollback_at_every_swap_boundary(self):
        for failure in range(1, 5):
            with self.subTest(failure=failure):
                before = self.snapshot()
                rename = os.rename
                calls = 0

                def fail_once(source, target):
                    nonlocal calls
                    self.assert_locked()
                    calls += 1
                    if calls == failure:
                        raise OSError("injected rename failure")
                    return rename(source, target)

                with patch.object(install, "build_app", side_effect=self.fake_build), patch.object(update.os, "rename", side_effect=fail_once):
                    with self.assertRaisesRegex(OSError, "injected"):
                        update.commit(self.stage, self.root, self.home)
                self.assertEqual(before, self.snapshot())
                self.assertFalse(list(self.root.glob(".companion-*")))
                self.assertFalse(list(self.app.parent.glob(".companion-*")))

    def test_gui_copy_failure_precedes_all_swaps(self):
        before = self.snapshot()
        with patch.object(install, "build_app", side_effect=self.fake_build), patch.object(update.shutil, "copytree", side_effect=OSError("copy failed")):
            with self.assertRaisesRegex(OSError, "copy failed"):
                update.commit(self.stage, self.root, self.home)
        self.assertEqual(before, self.snapshot())

    def test_rollback_failure_retains_backups_for_manual_recovery(self):
        rename = os.rename
        calls = 0

        def fail_twice(source, target):
            nonlocal calls
            calls += 1
            if calls in (4, 5):
                raise OSError("injected failure")
            return rename(source, target)

        with patch.object(install, "build_app", side_effect=self.fake_build), patch.object(update.os, "rename", side_effect=fail_twice):
            with self.assertRaisesRegex(update.SafetyError, "manual recovery"):
                update.commit(self.stage, self.root, self.home)
        old_runtime = list(self.root.glob(".companion-runtime-*/old/dist/cli.js"))
        old_app = list(self.app.parent.glob(".companion-app-*/old.app/Contents/Resources/Configuration.json"))
        self.assertEqual(len(old_runtime), 1)
        self.assertEqual(old_runtime[0].read_text(), "// old\n")
        self.assertEqual(len(old_app), 1)
        self.assertEqual(json.loads(old_app[0].read_text()), self.config)

    def test_legacy_migration_preserves_disabled_login(self):
        del self.config["runtimeRoot"]
        self.write_config()
        shutil.copytree(self.runtime, self.app / "Contents/Resources/runtime")
        self.agent.unlink()
        with patch.object(install, "build_app", side_effect=self.fake_build):
            update.commit(self.stage, self.root, self.home)
        config = update.inspect_companion(self.root, self.home)
        self.assertEqual(config, dict(self.config, revision="new", runtimeRoot=str(self.runtime)))
        self.assertFalse((self.app / "Contents/Resources/runtime").exists())
        self.assertFalse(self.agent.exists())

    def test_staging_cannot_be_installed_runtime(self):
        with patch.object(install, "build_app") as build:
            with self.assertRaises(update.SafetyError):
                update.commit(self.runtime, self.root, self.home)
            build.assert_not_called()

    def test_configuration_change_during_build_aborts(self):
        def change_config(runtime, build, config, previous_app=None):
            built = self.fake_build(runtime, build, config, previous_app)
            self.config["port"] += 1
            self.write_config()
            return built
        before_cli = (self.runtime / "dist/cli.js").read_bytes()
        with patch.object(install, "build_app", side_effect=change_config):
            with self.assertRaisesRegex(update.SafetyError, "configuration changed"):
                update.commit(self.stage, self.root, self.home)
        self.assertEqual((self.runtime / "dist/cli.js").read_bytes(), before_cli)
        self.assertTrue(self.stage.exists())


class NativeBuildTests(Fixture):
    def setUp(self):
        super().setUp()
        self.tools = self.base / "toolchain/usr"
        self.compiler = self.tools / "bin/swiftc"
        self.compiler.parent.mkdir(parents=True)
        self.compiler.write_text("fixture compiler")
        self.sdk = self.base / "sdk"
        self.sdk.mkdir()
        (self.sdk / "AppKit.tbd").write_text("fixture sdk")
        self.recipe = self.base / "install-recipe.py"
        self.recipe.write_text("fixture build recipe")
        for runtime in (self.runtime, self.stage):
            source = runtime / "integrations/macos-companion"
            for helper in ("menu-update.mjs", "update-check.mjs"):
                (source / helper).write_text(runtime.name + helper)
        self.commands = []
        self.verify_fails = False
        self.patches = [patch.object(install, "run", side_effect=self.native_run),
                        patch.object(install.subprocess, "check_output", side_effect=self.native_output),
                        patch.object(install.shutil, "which", return_value="/fixture/codesign"),
                        patch.object(install, "__file__", str(self.recipe))]
        for mock in self.patches:
            mock.start()
            self.addCleanup(mock.stop)

    def native_output(self, command, **kwargs):
        if "--find" in command:
            return str(self.compiler) + "\n"
        if "--show-sdk-path" in command:
            return str(self.sdk) + "\n"
        if "--version" in command:
            return "fixture Swift 5\n"
        raise AssertionError(command)

    def native_run(self, *args, **kwargs):
        self.commands.append(tuple(str(a) for a in args))
        if str(args[0]) == str(self.compiler):
            target = Path(args[args.index("-o") + 1])
            source = Path(args[args.index("-o") - 1])
            target.write_bytes(b"fixture native code:" + source.read_bytes())
            target.chmod(0o755)
            # Compiler gets only explicitly controlled variables.
            self.assertEqual(set(kwargs["env"]) - {"DEVELOPER_DIR", "TOOLCHAINS"},
                             {"PATH", "LANG", "HOME", "TMPDIR"})
        if "--verify" in args and self.verify_fails:
            raise subprocess.CalledProcessError(1, "codesign")

    def build(self, runtime=None, previous=None):
        scratch = Path(tempfile.mkdtemp(prefix="native-build-", dir=self.base))
        with redirect_stdout(io.StringIO()):
            return install.build_app(runtime or self.runtime, scratch, self.config, previous_app=previous)

    def compilations(self):
        return sum(command[0] == str(self.compiler) for command in self.commands)

    def seed(self):
        built = self.build()
        shutil.rmtree(self.app)
        shutil.copytree(built, self.app)
        # Only the native source is unchanged; runtime, package and helpers differ.
        shutil.copy2(self.runtime / "integrations/macos-companion/Companion.swift",
                     self.stage / "integrations/macos-companion/Companion.swift")
        self.commands.clear()

    def test_reused_commit_refreshes_all_resources_revision_and_signature(self):
        self.seed()
        ino = (self.support / "companion.lock").stat().st_ino
        key = (self.support / "api-key").read_bytes()
        memory = self.snapshot(self.memory)
        update.commit(self.stage, self.root, self.home)
        self.assertEqual(self.compilations(), 0)
        self.assertEqual(update.inspect_companion(self.root, self.home), dict(self.config, revision="new"))
        self.assertEqual(plistlib.loads((self.app / "Contents/Info.plist").read_bytes())["CFBundleShortVersionString"], "new")
        for helper in ("menu-update.mjs", "update-check.mjs"):
            self.assertEqual((self.app / "Contents/Resources" / helper).read_bytes(),
                             (self.runtime / "integrations/macos-companion" / helper).read_bytes())
        self.assertTrue(any("--sign" in command and command[-1].endswith("jumpyBrain.app") for command in self.commands))
        self.assertEqual(key, (self.support / "api-key").read_bytes())
        self.assertEqual(memory, self.snapshot(self.memory))
        self.assertEqual(ino, (self.support / "companion.lock").stat().st_ino)

    def test_same_size_same_mtime_changes_to_source_compiler_sdk_and_recipe_rebuild(self):
        self.seed()
        for target in (self.stage / "integrations/macos-companion/Companion.swift", self.compiler,
                       self.sdk / "AppKit.tbd", self.recipe):
            with self.subTest(input=target):
                original = target.read_bytes()
                times = target.stat()
                target.write_bytes(bytes([original[0] ^ 1]) + original[1:])
                os.utime(target, ns=(times.st_atime_ns, times.st_mtime_ns))
                self.commands.clear()
                self.build(self.stage, self.app)
                self.assertEqual(self.compilations(), 1)
                target.write_bytes(original)

    def test_missing_malformed_unknown_record_and_invalid_binary_rebuild(self):
        self.seed()
        record = self.app / "Contents/Resources" / install.NATIVE_BUILD_RECORD
        original = record.read_bytes()
        for value in (None, b"not json", b"[]", b'{"schemaVersion":99}'):
            with self.subTest(record=value):
                if value is None:
                    record.unlink()
                else:
                    record.write_bytes(value)
                self.commands.clear()
                self.build(self.stage, self.app)
                self.assertEqual(self.compilations(), 1)
                record.write_bytes(original)
        binary = self.app / "Contents/MacOS/jumpyBrain"
        binary.write_text("tampered executable")
        self.commands.clear()
        self.build(self.stage, self.app)
        self.assertEqual(self.compilations(), 1)

    def test_symlink_record_or_executable_and_unverifiable_signature_rebuild(self):
        self.seed()
        for path in (self.app / "Contents/Resources" / install.NATIVE_BUILD_RECORD,
                     self.app / "Contents/MacOS/jumpyBrain"):
            with self.subTest(path=path):
                backup = path.with_suffix(".backup")
                path.rename(backup)
                path.symlink_to(backup)
                self.commands.clear()
                self.build(self.stage, self.app)
                self.assertEqual(self.compilations(), 1)
                path.unlink()
                backup.rename(path)
        self.verify_fails = True
        self.commands.clear()
        self.build(self.stage, self.app)
        self.assertEqual(self.compilations(), 1)

    def test_input_probe_failure_rebuilds_without_record(self):
        self.seed()
        with patch.object(install, "native_fingerprint", side_effect=OSError("cannot inspect SDK")):
            built = self.build(self.stage, self.app)
        self.assertEqual(self.compilations(), 1)
        self.assertFalse((built / "Contents/Resources" / install.NATIVE_BUILD_RECORD).exists())

    def test_compiler_version_timeout_rebuilds_without_record(self):
        def timed_out_version(args, **kwargs):
            if "--version" in args:
                raise subprocess.TimeoutExpired("swiftc --version", 5)
            return self.native_output(args, **kwargs)
        with patch.object(install.subprocess, "check_output", side_effect=timed_out_version):
            built = self.build()
        self.assertEqual(self.compilations(), 1)
        self.assertFalse((built / "Contents/Resources" / install.NATIVE_BUILD_RECORD).exists())

    def test_inputs_changed_during_compile_do_not_record_a_false_hit(self):
        with patch.object(install, "native_fingerprint", side_effect=["before", "after"]):
            built = self.build()
        self.assertFalse((built / "Contents/Resources" / install.NATIVE_BUILD_RECORD).exists())

    def test_copy_failure_and_nonexecutable_cached_binary_rebuild(self):
        self.seed()
        copy = shutil.copy2
        def fail_cached_copy(source, target, **kwargs):
            if source == self.app / "Contents/MacOS/jumpyBrain":
                raise OSError("cached binary copy failed")
            return copy(source, target, **kwargs)
        with patch.object(install.shutil, "copy2", side_effect=fail_cached_copy):
            self.build(self.stage, self.app)
        self.assertEqual(self.compilations(), 1)
        self.commands.clear()
        (self.app / "Contents/MacOS/jumpyBrain").chmod(0o600)
        self.build(self.stage, self.app)
        self.assertEqual(self.compilations(), 1)

    def test_reused_update_rolls_back_at_each_swap_boundary(self):
        self.seed()
        for failure in range(1, 5):
            with self.subTest(boundary=failure):
                before = self.snapshot(self.home)
                rename = os.rename
                calls = 0
                def fail_once(source, target):
                    nonlocal calls
                    self.assert_locked()
                    calls += 1
                    if calls == failure:
                        raise OSError("injected reused-update failure")
                    return rename(source, target)
                with patch.object(update.os, "rename", side_effect=fail_once):
                    with self.assertRaisesRegex(OSError, "injected"):
                        update.commit(self.stage, self.root, self.home)
                self.assertEqual(before, self.snapshot(self.home))
                self.assertEqual(self.compilations(), 0)

    def test_target_options_environment_toolchain_version_and_overlay_are_inputs(self):
        source = self.runtime / "integrations/macos-companion/Companion.swift"
        env = {"PATH": "/fixture", "HOME": "/scratch-one", "TMPDIR": "/scratch-one"}
        def fingerprint(options=None, environment=None):
            return install.native_fingerprint(source, self.compiler, str(self.sdk), options or ["-O"], environment or env)
        original = fingerprint()
        self.assertEqual(original, fingerprint(environment=dict(env, HOME="/scratch-two", TMPDIR="/scratch-two")))
        self.assertNotEqual(original, fingerprint(["-Onone"]))
        self.assertNotEqual(original, fingerprint(["-O", "duplicateBridgingOverlay=True"]))
        self.assertNotEqual(original, fingerprint(environment=dict(env, DEVELOPER_DIR="/different")))
        with patch.object(install.platform, "machine", return_value="different-architecture"):
            self.assertNotEqual(original, fingerprint())
        with patch.object(install.subprocess, "check_output", return_value="new Swift"):
            self.assertNotEqual(original, fingerprint())

    def test_sdk_symlink_target_changes_invalidate(self):
        external = self.base / "external-header"
        external.write_text("header one")
        (self.sdk / "header.h").symlink_to(external)
        before = install.tree_digest(self.sdk)
        external.write_text("header two")
        self.assertNotEqual(before, install.tree_digest(self.sdk))
        external.unlink()
        missing = install.tree_digest(self.sdk)
        external.write_text("header two")
        self.assertNotEqual(missing, install.tree_digest(self.sdk))

    def test_signing_failure_on_reused_path_leaves_installed_pair_intact(self):
        self.seed()
        before = self.snapshot(self.home)
        def fail_sign(*args, **kwargs):
            if "--sign" in args:
                raise subprocess.CalledProcessError(1, "codesign")
            return self.native_run(*args, **kwargs)
        with patch.object(install, "run", side_effect=fail_sign):
            with self.assertRaises(subprocess.CalledProcessError):
                update.commit(self.stage, self.root, self.home)
        self.assertEqual(before, self.snapshot(self.home))
        self.assertEqual(self.compilations(), 0)


class StandaloneTests(Fixture):
    def run_install(self, extra=()):
        argv = ["install.py", "--home", str(self.home), "--install-root", str(self.root), *extra]
        with patch.object(sys, "argv", argv), patch.object(sys, "platform", "darwin"), redirect_stdout(io.StringIO()):
            return install.main()

    def standalone_build(self, runtime, build, config, previous_app=None):
        self.assertEqual(previous_app, self.app if self.app.exists() else None)
        self.assertEqual(runtime, self.runtime)
        self.assert_locked()
        app = build / "jumpyBrain.app"
        self.make_app(app, dict(config, revision="new"))
        return app

    def test_reinstall_uses_managed_runtime_preserves_config_and_never_starts(self):
        self.agent.unlink()
        original_runtime = self.snapshot(self.runtime)
        with patch.object(install, "build_app", side_effect=self.standalone_build), patch.object(install, "run") as run:
            self.assertEqual(self.run_install(), 0)
            run.assert_not_called()
        self.assertEqual(update.inspect_companion(self.root, self.home), dict(self.config, revision="new"))
        self.assertFalse(self.agent.exists())
        self.assertEqual(original_runtime, self.snapshot(self.runtime))

    def test_explicit_port_and_memory_are_only_overrides(self):
        memory = self.base / "override-memory"
        memory.mkdir()
        (memory / "jumpybrain.json").write_text("{}\n")
        with patch.object(install, "build_app", side_effect=self.standalone_build):
            self.run_install(["--port", "4999", "--memory-root", str(memory)])
        self.assertEqual(update.inspect_companion(self.root, self.home), dict(self.config, revision="new", port=4999, memoryRoot=str(memory)))

    def test_standalone_reinstall_rollback(self):
        before = self.snapshot()
        rename = os.rename
        calls = 0
        def fail_new_app(source, target):
            nonlocal calls
            self.assert_locked()
            calls += 1
            if calls == 2:
                raise OSError("fixture swap failure")
            return rename(source, target)
        with patch.object(install, "build_app", side_effect=self.standalone_build), patch.object(install.os, "rename", side_effect=fail_new_app):
            with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
                self.run_install()
        self.assertEqual(before, self.snapshot())

    def test_fresh_no_start_uses_managed_memory_and_creates_only_native_settings(self):
        shutil.rmtree(self.app)
        self.agent.unlink()
        self.manifest["memoryRoot"] = str(self.memory)
        (self.root / "install-manifest.json").write_text(json.dumps(self.manifest))
        self.support = self.home / "Library/Application Support/jumpyBrain Companion"
        before_memory, before_runtime = self.snapshot(self.memory), self.snapshot(self.runtime)
        with patch.object(install, "build_app", side_effect=self.standalone_build), patch.object(install.shutil, "which", return_value="/fixture/tool"), patch.object(install, "run") as run:
            self.run_install(["--no-start"])
            run.assert_not_called()
        config = update.inspect_companion(self.root, self.home)
        self.assertEqual(config["memoryRoot"], str(self.memory))
        self.assertEqual(config["runtimeRoot"], str(self.runtime))
        self.assertEqual(config["port"], 3787)
        self.assertTrue(self.agent.is_file())
        update.validate_key(self.support)
        self.assertEqual((self.support / "api-key").stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.snapshot(self.memory), before_memory)
        self.assertEqual(self.snapshot(self.runtime), before_runtime)

    def test_standalone_refuses_app_bound_to_other_install(self):
        self.config["runtimeRoot"] = str(self.base / "other/app")
        self.write_config()
        before = self.snapshot()
        with patch.object(install, "build_app") as build, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                self.run_install(["--no-start"])
            build.assert_not_called()
        self.assertEqual(before, self.snapshot())

    def test_standalone_running_refusal_does_not_build_or_write(self):
        before = self.snapshot()
        with update.companion_lock(self.support), patch.object(install, "build_app") as build, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                self.run_install(["--no-start"])
            build.assert_not_called()
        self.assertEqual(before, self.snapshot())

    def test_build_only_fixture_needs_no_managed_install_or_initialized_memory(self):
        output = self.base / "build-output.app"
        shutil.rmtree(self.app)
        shutil.rmtree(self.support)
        (self.root / "install-manifest.json").unlink()
        before = self.snapshot()
        def build(runtime, scratch, config, previous_app=None):
            self.assertIsNone(previous_app)
            self.assertEqual(runtime, self.stage)
            self.assertEqual(config["runtimeRoot"], str(self.stage))
            app = scratch / "jumpyBrain.app"
            self.make_app(app, dict(config, revision="new"))
            return app
        with patch.object(install, "build_app", side_effect=build), patch.object(install.shutil, "which", return_value="/fixture/tool"), patch.object(install, "run") as run:
            self.run_install(["--build-only", "--runtime-root", str(self.stage), "--output", str(output)])
            run.assert_not_called()
        self.assertTrue(output.exists())
        shutil.rmtree(output)
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.support.exists())


if __name__ == "__main__":
    unittest.main()
