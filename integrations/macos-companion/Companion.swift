import AppKit
import Darwin
import Security
import LocalAuthentication

// Native lifecycle and capabilities only; memory and connection policy live in the runtime.
struct Configuration: Decodable {
    let node: String
    let qmd: String
    let memoryRoot: String
    var runtimeRoot: String
    let supportDirectory: String
    let launchAgent: String
    let label: String
    let port: Int
    let revision: String
}

// Anonymous child pipes are the only credential transport. Never echo a request or
// Security error: even malformed frames may contain a key. No plaintext fallback.
final class NativeBridge {
    private let reader: FileHandle
    private let writer: FileHandle
    private let io = DispatchQueue(label: "local.jumpybrain.companion.rpc")
    private let credentials = DispatchQueue(label: "local.jumpybrain.companion.keychain")
    private var readSource: DispatchSourceRead?
    private var writeSource: DispatchSourceWrite?
    private var input = Data()
    private var output = Data()
    private var pending = Set<String>()
    private var closed = false
    private var writeSuspended = false
    private var panel: NSOpenPanel? // main-thread only
    private let failed: () -> Void
    private static let service = "local.jumpybrain.companion.connections"

    init(reader: FileHandle, writer: FileHandle, failed: @escaping () -> Void) {
        self.reader = reader
        self.writer = writer
        self.failed = failed
    }

    func start() {
        io.sync {
            for fd in [reader.fileDescriptor, writer.fileDescriptor] {
                let flags = fcntl(fd, F_GETFL)
                guard flags >= 0, fcntl(fd, F_SETFL, flags | O_NONBLOCK) >= 0 else { protocolFailure(); return }
            }
            let source = DispatchSource.makeReadSource(fileDescriptor: reader.fileDescriptor, queue: io)
            source.setEventHandler { [weak self] in self?.readFrames() }
            source.setCancelHandler { [reader] in try? reader.close() }
            readSource = source
            source.resume()
        }
    }

    func stop() { io.sync { close() } }

    private func close() {
        guard !closed else { return }
        closed = true
        input.removeAll()
        output.removeAll()
        pending.removeAll()
        if let source = readSource { source.cancel() } else { try? reader.close() }
        readSource = nil
        if let source = writeSource {
            if writeSuspended { source.resume(); writeSuspended = false }
            source.cancel()
            writeSource = nil
        } else { try? writer.close() }
        DispatchQueue.main.async { self.panel?.cancel(nil); self.panel = nil }
    }

    private func protocolFailure(_ reason: String = "invalid_frame") {
        guard !closed else { return }
        // Static reason codes only: frames can contain credentials.
        fputs("Native connection bridge failed: " + reason + "\n", stderr)
        close()
        DispatchQueue.main.async(execute: failed)
    }

    private func readFrames() {
        guard !closed else { return }
        var bytes = [UInt8](repeating: 0, count: 4096)
        // Bound a dispatch turn as well as the line buffer and outstanding work.
        for _ in 0..<16 {
            let count = Darwin.read(reader.fileDescriptor, &bytes, bytes.count)
            if count < 0 {
                if errno == EAGAIN || errno == EINTR { return }
                protocolFailure("read_error"); return
            }
            if count == 0 { protocolFailure("pipe_eof"); return }
            input.append(contentsOf: bytes.prefix(count))
            guard input.count <= 32768 else { protocolFailure(); return }
            while let newline = input.firstIndex(of: 10) {
                let frame = Data(input[..<newline])
                input.removeSubrange(...newline)
                guard frame.count <= 16384,
                      let object = (try? JSONSerialization.jsonObject(with: frame)) as? [String: Any],
                      let id = object["id"],
                      let token = Self.idToken(id), !pending.contains(token), pending.count < 32,
                      let operation = object["operation"] as? String,
                      ["get", "set", "delete", "select-folder"].contains(operation) else {
                    protocolFailure(); return
                }
                pending.insert(token)
                if operation == "select-folder" {
                    DispatchQueue.main.async { [weak self] in self?.selectFolder(id, token) }
                } else {
                    guard let reference = object["reference"] as? String,
                          !reference.isEmpty, reference.utf8.count <= 256,
                          !reference.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
                          operation != "set" || ((object["key"] as? String).map { !$0.isEmpty && $0.utf8.count <= 8192 } == true) else {
                        reply(id, token, result: nil, unavailable: true); continue
                    }
                    let key = object["key"] as? String
                    credentials.async { [weak self] in
                        guard let self = self, self.io.sync(execute: { !self.closed }) else { return }
                        let response = Self.credential(operation, reference, key)
                        self.io.async { self.reply(id, token, result: response.0, unavailable: response.1) }
                    }
                }
            }
        }
    }

    private static func idToken(_ id: Any) -> String? {
        if let string = id as? String, !string.isEmpty, string.utf8.count <= 128 { return "s:" + string }
        if let number = id as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
           number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
           abs(number.doubleValue) <= 9007199254740991 { return "n:" + number.stringValue }
        return nil
    }

    private func reply(_ id: Any, _ token: String, result: String?, unavailable: Bool = false) {
        guard !closed, pending.remove(token) != nil else { return }
        let object: [String: Any] = unavailable ? ["id": id, "error": "credential_unavailable"] : ["id": id, "result": result as Any? ?? NSNull()]
        guard var data = try? JSONSerialization.data(withJSONObject: object), data.count <= 65536,
              output.count + data.count + 1 <= 262144 else { protocolFailure(); return }
        data.append(10)
        output.append(data)
        if writeSource == nil {
            let source = DispatchSource.makeWriteSource(fileDescriptor: writer.fileDescriptor, queue: io)
            source.setEventHandler { [weak self] in self?.flush() }
            source.setCancelHandler { [writer] in try? writer.close() }
            writeSource = source
            source.resume()
        }
        if writeSuspended { writeSource?.resume(); writeSuspended = false }
        flush()
    }

    private func flush() {
        guard !closed else { return }
        while !output.isEmpty {
            let count = output.withUnsafeBytes { Darwin.write(writer.fileDescriptor, $0.baseAddress!, $0.count) }
            if count < 0 {
                if errno == EAGAIN || errno == EINTR { return }
                protocolFailure(); return
            }
            guard count > 0 else { protocolFailure(); return }
            output.removeFirst(count)
        }
        // A write source is level-triggered. Suspend while empty, then resume on
        // the next reply; cancellation must balance that suspension.
        if !writeSuspended { writeSource?.suspend(); writeSuspended = true }
    }

    private func selectFolder(_ id: Any, _ token: String) {
        guard io.sync(execute: { !closed }) else { return }
        guard panel == nil else { io.async { self.reply(id, token, result: nil) }; return }
        let chooser = NSOpenPanel()
        chooser.canChooseFiles = false
        chooser.canChooseDirectories = true
        chooser.allowsMultipleSelection = false
        chooser.canCreateDirectories = false
        chooser.prompt = "Choose Memory Folder"
        panel = chooser
        NSApp.activate(ignoringOtherApps: true)
        chooser.begin { [weak self] response in
            guard let self = self else { return }
            self.panel = nil
            var path: String?
            if response == .OK, let url = chooser.url, url.isFileURL {
                var directory: ObjCBool = false
                if FileManager.default.fileExists(atPath: url.path, isDirectory: &directory), directory.boolValue { path = url.path }
            }
            let selected = path
            self.io.async { self.reply(id, token, result: selected) }
        }
    }

    private static func credential(_ operation: String, _ reference: String, _ key: String?) -> (String?, Bool) {
        // Use the default Keychain; locked/denied access is an explicit failure,
        // never a prompt at login, a different store, or a plaintext fallback.
        // The default macOS Keychain may use legacy ACLs, which do not honor
        // LAContext alone. Disable Security-agent interaction process-wide too:
        // an ad-hoc rebuild must return unavailable, not wait on a hidden prompt.
        guard SecKeychainSetUserInteractionAllowed(false) == errSecSuccess else { return (nil, true) }
        let context = LAContext()
        context.interactionNotAllowed = true
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: reference,
            kSecUseAuthenticationContext as String: context]
        if operation == "get" {
            var lookup = query
            lookup[kSecReturnData as String] = true
            lookup[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?
            let status = SecItemCopyMatching(lookup as CFDictionary, &item)
            if status == errSecItemNotFound { return (nil, false) }
            guard status == errSecSuccess, let data = item as? Data, data.count <= 8192,
                  let value = String(data: data, encoding: .utf8), !value.isEmpty else { return (nil, true) }
            return (value, false)
        }
        if operation == "delete" {
            let status = SecItemDelete(query as CFDictionary)
            return (nil, status != errSecSuccess && status != errSecItemNotFound)
        }
        guard let data = key?.data(using: .utf8) else { return (nil, true) }
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var addition = query
            addition[kSecValueData as String] = data
            return (nil, SecItemAdd(addition as CFDictionary, nil) != errSecSuccess)
        }
        return (nil, status != errSecSuccess)
    }
}

private struct BrainProfile: Decodable {
    let name: String
    let kind: String
    let root: String?
}

private struct CompanionState: Decodable {
    let phase: String
    let health: String
    let active: BrainProfile?
}

final class Companion: NSObject, NSApplicationDelegate {
    private let desktopHost = ProcessInfo.processInfo.arguments.contains("--desktop-host")
    private let desktopParent = getppid()
    private var parentTimer: Timer?
    private var config: Configuration!
    private var statusItem: NSStatusItem!
    // Desktop brain contours as an adaptive monochrome menu-bar template.
    private lazy var brainIcon: NSImage? = {
        guard let url = Bundle.main.url(forResource: "MenuBarBrain", withExtension: "png"),
              let image = NSImage(contentsOf: url) else { return nil }
        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = true
        return image
    }()
    private let statusLine = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
    private var openItem: NSMenuItem!
    private var settingsItem: NSMenuItem!
    private var memoryItem: NSMenuItem!
    private var connectionState: CompanionState?
    private var switching: Bool { connectionState?.phase == "preparing" }
    private var nativeBridge: NativeBridge?
    private var restartItem: NSMenuItem!
    private var loginItem: NSMenuItem!
    private var updateItem: NSMenuItem!
    private var checkUpdateItem: NSMenuItem!
    private let updateStatus = NSMenuItem(title: "Updates: not checked", action: nil, keyEquivalent: "")
    private var updateTimer: Timer?
    private var updateCheck: Process?
    private var updating = false
    private var updateHandoffDirectory: URL?
    private var server: Process?
    private var output: FileHandle?
    private var healthTimer: Timer?
    private var signals: [DispatchSourceSignal] = []
    private var healthInFlight = false
    private var ready = false
    private var stopping = false
    private var quitting = false
    private var lockFD: Int32 = -1
    private var ownsLock = false
    private var apiKey = ""
    private var startupTime = Date()
    private var openWhenReady = false
    private var baseURL: String { "http://127.0.0.1:\(config.port)" }
    private var logURL: URL { URL(fileURLWithPath: config.supportDirectory).appendingPathComponent("server.log") }
    private let diagnosticSession = "d_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()

    // Separate, content-free lifecycle evidence. Raw stderr/configuration and
    // credential frames never enter this snapshot or the support attachment.
    private func recordNativeDiagnostic(_ operation: String, _ code: String, exitCode: Int32? = nil) {
        guard config != nil else { return }
        let operations = ["startup", "shutdown", "bridge", "update", "connection"]
        let codes = ["none", "native_start_failed", "native_update_failed", "child_terminated", "bridge_lost", "unavailable"]
        guard operations.contains(operation), codes.contains(code) else { return }
        let fm = FileManager.default, directory = URL(fileURLWithPath: config.supportDirectory)
        var parent = stat()
        guard lstat(directory.path, &parent) == 0, parent.st_mode & S_IFMT == S_IFDIR, parent.st_uid == getuid(), parent.st_mode & 0o077 == 0 else { return }
        let url = directory.appendingPathComponent("native-diagnostics.json")
        var events = [[String: Any]]()
        var dropped = 0
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        if fd >= 0 {
            var info = stat()
            guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_nlink == 1, info.st_uid == getuid(), info.st_size <= 65536, info.st_mode & 0o077 == 0 else { Darwin.close(fd); return }
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
            if let data = try? handle.read(upToCount: 65536), let packet = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let stored = packet["events"] as? [[String: Any]] {
                dropped = min(1_000_000_000, max(0, packet["dropped"] as? Int ?? 0))
                let formatter = ISO8601DateFormatter()
                for item in stored.suffix(64) {
                    guard let at = item["at"] as? String, let date = formatter.date(from: at), Date().timeIntervalSince(date) < 7 * 86400, date.timeIntervalSinceNow < 60,
                          let op = item["operation"] as? String, operations.contains(op), let kind = item["code"] as? String, codes.contains(kind),
                          let session = item["session"] as? String, session.range(of: "^d_[a-f0-9]{32}$", options: .regularExpression) != nil else { continue }
                    var clean: [String: Any] = ["schema": 1, "component": "native", "at": at, "operation": op, "code": kind, "session": session, "severity": kind == "none" ? "info" : "warn", "outcome": kind == "none" ? "ok" : "failed"]
                    if let number = item["exitCode"] as? Int, number >= -65535, number <= 65535 { clean["exitCode"] = number }
                    events.append(clean)
                }
            }
            Darwin.close(fd)
        } else if errno != ENOENT { return }
        var event: [String: Any] = ["schema": 1, "component": "native", "at": Date().ISO8601Format(), "operation": operation, "code": code, "session": diagnosticSession, "severity": code == "none" ? "info" : "warn", "outcome": code == "none" ? "ok" : "failed"]
        if let value = exitCode { event["exitCode"] = Int(value) }
        events.append(event)
        if events.count > 64 {
            let ordinary = events.firstIndex { ($0["outcome"] as? String) == "ok" }
            events.remove(at: ordinary ?? 0)
            dropped = min(1_000_000_000, dropped + 1)
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: ["schema": 1, "events": Array(events.suffix(64)), "dropped": dropped])
            guard data.count <= 65536 else { return }
            try data.write(to: url, options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch { /* Diagnostic failure must not interfere with native lifecycle. */ }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let url = Bundle.main.url(forResource: "Configuration", withExtension: "json")!
            config = try JSONDecoder().decode(Configuration.self, from: Data(contentsOf: url))
            if desktopHost {
                // The nested helper and runtime move with the enclosing app.
                let resources = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
                config.runtimeRoot = resources.appendingPathComponent("runtime").path
                guard desktopParent > 1 else { throw NSError(domain: "Companion", code: 3) }
                parentTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                    guard let self = self else { return }
                    if getppid() != self.desktopParent { RunLoop.main.perform { NSApp.terminate(nil) } }
                }
            }
            // Lock is NOT inherited by Node. A second app must never adopt/kill another server.
            lockFD = Darwin.open(config.supportDirectory + "/companion.lock", O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
                NSApp.terminate(nil)
                return
            }
            ownsLock = true
            recordNativeDiagnostic("startup", "none")
            guard config.runtimeRoot.hasPrefix("/"),
                  FileManager.default.fileExists(atPath: config.runtimeRoot + "/dist/cli.js") else {
                throw NSError(domain: "Companion", code: 2, userInfo: [NSLocalizedDescriptionKey: "Installed runtime is missing. Repair the managed CLI installation before reopening jumpyBrain."])
            }
            openWhenReady = ProcessInfo.processInfo.arguments.contains("--open-editor")
            apiKey = try String(contentsOfFile: config.supportDirectory + "/api-key", encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard apiKey.count == 64, apiKey.allSatisfy({ $0.isHexDigit }) else {
                throw NSError(domain: "Companion", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing/invalid local key. Re-run install.py."])
            }
            signal(SIGPIPE, SIG_IGN) // A closing child pipe must not terminate the app.
            if !desktopHost { makeMenu() }
            prepareLog()
            for sig in [SIGTERM, SIGINT] {
                signal(sig, SIG_IGN)
                let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
                source.setEventHandler {
                    // terminateLater may enter a nested AppKit loop. Don't call it
                    // inside a main-queue block that would starve shutdown callbacks.
                    RunLoop.main.perform { NSApp.terminate(nil) }
                }
                source.resume()
                signals.append(source)
            }
            startServer()
            healthTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.checkHealth() }
            if !desktopHost {
                checkForUpdates()
                updateTimer = Timer.scheduledTimer(withTimeInterval: 6 * 60 * 60, repeats: true) { [weak self] _ in self?.checkForUpdates() }
            }
        } catch {
            showError("Could not start jumpyBrain", error.localizedDescription)
            NSApp.terminate(nil)
        }
    }

    private func makeMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.autoenablesItems = false
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        menu.addItem(.separator())
        openItem = add(menu, "Open Editor in Chrome", #selector(openEditor), "o")
        settingsItem = add(menu, "Settings…", #selector(openSettings), ",")
        menu.addItem(.separator())
        let appItem = NSMenuItem(title: "App", action: nil, keyEquivalent: "")
        let appMenu = NSMenu()
        appMenu.autoenablesItems = false
        appItem.submenu = appMenu
        menu.addItem(appItem)
        loginItem = add(appMenu, "Start at Login", #selector(toggleLogin))
        updateLoginState()
        updateStatus.isEnabled = false
        appMenu.addItem(updateStatus)
        checkUpdateItem = add(appMenu, "Check for Updates", #selector(checkForUpdates))
        updateItem = add(appMenu, "Update jumpyBrain…", #selector(updateApp))
        let build = NSMenuItem(title: "Version \(config.revision) (beta)", action: nil, keyEquivalent: "")
        build.isEnabled = false
        appMenu.addItem(build)

        let troubleshootingItem = NSMenuItem(title: "Troubleshooting", action: nil, keyEquivalent: "")
        let troubleshootingMenu = NSMenu()
        troubleshootingMenu.autoenablesItems = false
        troubleshootingItem.submenu = troubleshootingMenu
        menu.addItem(troubleshootingItem)
        restartItem = add(troubleshootingMenu, "Restart Server…", #selector(restartServer))
        memoryItem = add(troubleshootingMenu, "Open Memory Folder", #selector(openMemory))
        _ = add(troubleshootingMenu, "Show Logs", #selector(showLogs))
        menu.addItem(.separator())
        _ = add(menu, "Quit jumpyBrain", #selector(quit), "q")
        statusItem.menu = menu
        setStatus("Starting…", healthy: false)
    }

    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
        return item
    }

    private func setStatus(_ text: String, healthy: Bool) {
        ready = healthy
        if statusLine.title != text && connectionState == nil {
            if let line = "\(Date().ISO8601Format()) companion: \(text)\n".data(using: .utf8) { try? output?.write(contentsOf: line) }
        }
        statusLine.title = text
        let connected = healthy && (connectionState == nil || connectionState?.health == "connected")
        if let image = brainIcon {
            image.accessibilityDescription = "jumpyBrain: \(text)"
            statusItem?.button?.image = image
        } else {
            // Older/minimal bundles can still start without the artwork resource.
            statusItem?.button?.image = NSImage(systemSymbolName: connected ? "brain" : "exclamationmark.circle", accessibilityDescription: "jumpyBrain: \(text)")
            statusItem?.button?.image?.isTemplate = true
        }
        statusItem?.button?.toolTip = "jumpyBrain — \(text)"
        openItem?.isEnabled = healthy && !stopping && !updating
        settingsItem?.isEnabled = healthy && !stopping && !updating
        memoryItem?.isEnabled = healthy && connectionState?.active?.kind == "local" && !stopping && !updating && !switching
        restartItem?.isEnabled = !stopping && !updating && !switching
        updateItem?.isEnabled = !stopping && !updating
        checkUpdateItem?.isEnabled = !stopping && !updating && updateCheck == nil
        loginItem?.isEnabled = !stopping && !updating
    }

    private func prepareLog() {
        // Bound the local log at startup, keeping one previous generation.
        let fm = FileManager.default
        if let attrs = try? fm.attributesOfItem(atPath: logURL.path), let size = attrs[.size] as? NSNumber, size.intValue > 5_000_000 {
            let old = logURL.appendingPathExtension("previous")
            try? fm.removeItem(at: old)
            try? fm.moveItem(at: logURL, to: old)
        }
        if !fm.fileExists(atPath: logURL.path) { fm.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        output = try? FileHandle(forWritingTo: logURL)
        output?.seekToEndOfFile()
    }

    private func makeProcess(_ arguments: [String]) -> Process {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: config.node)
        p.arguments = arguments
        p.currentDirectoryURL = URL(fileURLWithPath: config.supportDirectory)
        // Do not inherit remote credentials or rely on interactive shell startup.
        p.environment = [
            "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
            "PATH": "\(URL(fileURLWithPath: config.node).deletingLastPathComponent().path):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "LANG": "en_US.UTF-8",
            "JUMPYBRAIN_QMD_BIN": config.qmd,
            "JUMPYBRAIN_SERVER_API_KEYS": apiKey,
            "JUMPYBRAIN_NO_UPDATE_CHECK": "1"
        ]
        if desktopHost, let instance = ProcessInfo.processInfo.environment["JUMPYBRAIN_DESKTOP_INSTANCE"] {
            p.environment?["JUMPYBRAIN_DESKTOP_INSTANCE"] = instance
        }
        if desktopHost, ProcessInfo.processInfo.environment["JUMPYBRAIN_READINESS_ONLY"] == "1" {
            p.environment?["JUMPYBRAIN_READINESS_ONLY"] = "1"
        }
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = output ?? FileHandle.nullDevice
        p.standardError = output ?? FileHandle.nullDevice
        return p
    }

    private func startServer() {
        guard !quitting, server == nil else { return }
        stopping = false
        setStatus("Starting…", healthy: false)
        // A bind probe catches normal conflicts; successful authenticated health below
        // still requires our child to be alive. Never attach to an existing service.
        guard portIsAvailable() else {
            setStatus("Port \(config.port) is busy — stop jbl-serve first", healthy: false)
            return
        }
        let gateway = config.runtimeRoot + "/integrations/macos-companion/gateway.mjs"
        let p = makeProcess([gateway, config.runtimeRoot, config.supportDirectory, config.memoryRoot, String(config.port)])
        let requests = Pipe()
        let responses = Pipe()
        p.standardOutput = requests // stdout is exclusively newline-delimited RPC.
        p.standardInput = responses
        let bridge = NativeBridge(reader: requests.fileHandleForReading, writer: responses.fileHandleForWriting) { [weak self, weak p] in
            guard let self = self, let p = p, self.server === p else { return }
            self.recordNativeDiagnostic("bridge", "bridge_lost")
            if p.isRunning { p.terminate() }
            self.setStatus("Native connection service unavailable — restart server", healthy: false)
        }
        nativeBridge = bridge
        p.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self = self, self.server === child else { return }
                self.recordNativeDiagnostic("shutdown", "child_terminated", exitCode: child.terminationStatus)
                self.nativeBridge?.stop()
                self.nativeBridge = nil
                self.connectionState = nil
                self.server = nil
                if !self.stopping { self.setStatus("Server stopped (\(child.terminationStatus)) — see logs", healthy: false) }
            }
        }
        do {
            server = p
            startupTime = Date()
            try p.run()
            // Process owns/closes the child pipe ends; closing their stale
            // FileHandles again can close a descriptor already reused by AppKit.
            bridge.start()
            checkHealth()
        } catch {
            bridge.stop()
            recordNativeDiagnostic("startup", "native_start_failed")
            nativeBridge = nil
            server = nil
            setStatus("Could not start server — see logs", healthy: false)
            showError("Could not start server", error.localizedDescription)
        }
    }

    private func portIsAvailable() -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { Darwin.close(fd) }
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout.size(ofValue: reuse)))
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(config.port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
            }
        }
    }

    private func checkHealth() {
        guard !quitting, !stopping, !healthInFlight, let child = server, child.isRunning else { return }
        healthInFlight = true
        // Control availability is independent of the selected target's health.
        var request = controlRequest("/companion/state", timeout: 4)
        request.httpMethod = "GET"
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let state = data.flatMap { try? JSONDecoder().decode(CompanionState.self, from: $0) }
            let ok = error == nil && (response as? HTTPURLResponse)?.statusCode == 200 && state != nil
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.healthInFlight = false
                guard self.server === child, child.isRunning, !self.stopping, !self.quitting else { return }
                if ok, let state = state {
                    self.present(state)
                    if self.openWhenReady { self.openWhenReady = false; self.openEditor() }
                } else if Date().timeIntervalSince(self.startupTime) > 15 {
                    self.setStatus("Server not responding — see logs", healthy: false)
                }
            }
        }.resume()
    }

    private func controlRequest(_ path: String, timeout: TimeInterval) -> URLRequest {
        var request = URLRequest(url: URL(string: baseURL + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func present(_ state: CompanionState) {
        connectionState = state
        let suffix = state.health == "connected" ? "Connected" : state.health == "credential_unavailable" ? "Keychain unavailable" : "Offline"
        // Profile names are untrusted display text, not log messages.
        let label = state.active?.name.replacingOccurrences(of: "\n", with: " ") ?? "Selected brain"
        let text = "\(label) · \(suffix)" + (state.phase == "preparing" ? " · Switching…" : "")
        setStatus(text, healthy: true)
        // Editor and Settings stay enabled when only the selected target is offline.
    }

    // Stop only Process instances we created; never kill by port/name/stale PID.
    private func stopServer(_ completion: @escaping () -> Void) {
        stopping = true
        setStatus("Stopping…", healthy: false)
        nativeBridge?.stop()
        nativeBridge = nil
        let children = [server].compactMap { $0 }.filter { $0.isRunning }
        children.forEach { $0.terminate() }
        let deadline = Date().addingTimeInterval(8)
        func wait() {
            let alive = children.filter { $0.isRunning }
            if alive.isEmpty { DispatchQueue.main.async(execute: completion); return }
            if Date() >= deadline { alive.forEach { Darwin.kill($0.processIdentifier, SIGKILL) } }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { wait() }
        }
        wait()
    }

    @objc private func openEditor() {
        guard ready else { openWhenReady = true; return }
        openBrowser("/")
    }

    @objc private func openSettings() {
        guard ready else { return }
        openBrowser("/settings")
    }

    private func openBrowser(_ path: String) {
        // Gateway consumes/removes the control fragment in an HttpOnly-cookie
        // handshake. Remote credentials never enter the browser.
        let url = URL(string: baseURL + path + "#companion=" + apiKey)!
        guard let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") else {
            showError("Google Chrome not found", "Install Chrome, then choose Open Editor again.")
            return
        }
        let options = NSWorkspace.OpenConfiguration()
        NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: options) { _, error in
            if let error = error { DispatchQueue.main.async { self.showError("Could not open Chrome", error.localizedDescription) } }
        }
    }

    @objc private func restartServer() {
        guard !switching else { return }
        guard server == nil || confirm("Restart local server?", "Wait for “Saved” in Chrome first. Browser-only drafts cannot be saved while the server is restarting.", "Restart") else { return }
        stopServer { [weak self] in self?.server = nil; self?.startServer() }
    }

    private var installRoot: URL { URL(fileURLWithPath: config.runtimeRoot).deletingLastPathComponent() }

    // Maintenance must not inherit the local server key or remote credentials.
    private var maintenanceEnvironment: [String: String] {
        ["HOME": FileManager.default.homeDirectoryForCurrentUser.path,
         "PATH": "\(URL(fileURLWithPath: config.node).deletingLastPathComponent().path):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
         "LANG": "en_US.UTF-8"]
    }

    @objc private func checkForUpdates() {
        guard updateCheck == nil, !updating, !quitting else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: config.node)
        p.arguments = [Bundle.main.resourceURL!.appendingPathComponent("update-check.mjs").path, installRoot.path]
        p.environment = maintenanceEnvironment
        p.currentDirectoryURL = URL(fileURLWithPath: config.supportDirectory)
        p.standardInput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        let pipe = Pipe()
        p.standardOutput = pipe
        updateCheck = p
        updateStatus.title = "Checking for updates…"
        checkUpdateItem.isEnabled = false
        p.terminationHandler = { [weak self] child in
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            DispatchQueue.main.async {
                guard let self = self, self.updateCheck === child else { return }
                self.updateCheck = nil
                guard !self.updating, !self.quitting else { return }
                let status = child.terminationStatus == 0 ? json?["status"] as? String : nil
                self.updateStatus.title = status == "available" ? "Update available" : status == "current" ? "Up to date" : "Updates: unable to check"
                self.updateItem.title = status == "available" ? "Update jumpyBrain… (available)" : "Update jumpyBrain…"
                self.checkUpdateItem.isEnabled = !self.stopping
            }
        }
        do { try p.run() } catch {
            updateCheck = nil
            updateStatus.title = "Updates: unable to check"
            checkUpdateItem.isEnabled = true
        }
    }

    @objc private func updateApp() {
        guard !updating, !stopping, !quitting else { return }
        let fm = FileManager.default
        let directory = URL(fileURLWithPath: config.supportDirectory).appendingPathComponent("update-" + UUID().uuidString)
        do {
            guard fm.fileExists(atPath: installRoot.appendingPathComponent("install-manifest.json").path) else {
                throw NSError(domain: "Companion", code: 3, userInfo: [NSLocalizedDescriptionKey: "Updating requires a managed CLI installation."])
            }
            try fm.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
            let helper = directory.appendingPathComponent("menu-update.mjs")
            try fm.copyItem(at: Bundle.main.resourceURL!.appendingPathComponent("menu-update.mjs"), to: helper)
            let label = "local.jumpybrain.updater." + directory.lastPathComponent
            let request: [String: Any] = ["parentPid": ProcessInfo.processInfo.processIdentifier,
                "installRoot": installRoot.path, "appPath": Bundle.main.bundlePath,
                "home": fm.homeDirectoryForCurrentUser.path, "node": config.node, "qmd": config.qmd,
                "launchdLabel": label]
            let requestURL = directory.appendingPathComponent("request.json")
            try JSONSerialization.data(withJSONObject: request).write(to: requestURL, options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: requestURL.path)
            let job = directory.appendingPathComponent("update.plist")
            let launchLog = directory.appendingPathComponent("launcher.log")
            fm.createFile(atPath: launchLog.path, contents: nil, attributes: [.posixPermissions: 0o600])
            let plist: [String: Any] = ["Label": label,
                "ProgramArguments": [config.node, helper.path, requestURL.path],
                "RunAtLoad": true, "KeepAlive": false, "ProcessType": "Background",
                "LimitLoadToSessionType": "Aqua", "WorkingDirectory": directory.path,
                "EnvironmentVariables": maintenanceEnvironment,
                "StandardOutPath": launchLog.path, "StandardErrorPath": launchLog.path]
            try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0).write(to: job, options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: job.path)
            updating = true
            updateItem.title = "Starting updater…"
            setStatus(statusLine.title, healthy: ready)
            updateHandoffDirectory = directory
            // A separate launchd job survives shutdown of the companion's job;
            // ordinary child processes can be killed with the app's process group.
            let launcher = Process()
            launcher.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            launcher.arguments = ["bootstrap", "gui/\(getuid())", job.path]
            launcher.environment = maintenanceEnvironment
            launcher.standardInput = FileHandle.nullDevice
            launcher.standardOutput = FileHandle.nullDevice
            launcher.standardError = FileHandle.nullDevice
            launcher.terminationHandler = { [weak self] child in
                DispatchQueue.main.async {
                    guard let self = self, !self.quitting, self.updateHandoffDirectory == directory else { return }
                    if child.terminationStatus != 0 {
                        self.updateHandoffFailed(directory, "Could not launch the background updater. The app is still running; check companion logs and try again.")
                    }
                }
            }
            try launcher.run()
            waitForUpdater(directory, deadline: Date().addingTimeInterval(20))
        } catch { updateHandoffFailed(directory, error.localizedDescription) }
    }

    private func waitForUpdater(_ directory: URL, deadline: Date) {
        guard updating, !quitting, updateHandoffDirectory == directory else { return }
        guard Date() < deadline else {
            updateHandoffFailed(directory, "The background updater did not acknowledge the update in time. The app is still running; try again.")
            return
        }
        let fm = FileManager.default
        if fm.fileExists(atPath: directory.appendingPathComponent("cancelled").path) {
            updateHandoffFailed(directory, "The updater was cancelled. The app is still running.")
            return
        }
        if fm.fileExists(atPath: directory.appendingPathComponent("ready").path) {
            do {
                let proceed = directory.appendingPathComponent("proceed")
                if !fm.fileExists(atPath: proceed.path) {
                    try "update\n".write(to: proceed, atomically: true, encoding: .utf8)
                }
                if let data = try? Data(contentsOf: directory.appendingPathComponent("acknowledged")),
                   let ack = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                   let pid = ack["pid"] as? Int32, let expires = ack["expires"] as? Double,
                   pid > 1, expires > Date().timeIntervalSince1970 * 1000, Darwin.kill(pid, 0) == 0 {
                    // A live runner has acknowledged this attempt. Clicking Update
                    // is authorization; do not show a second save/quit confirmation.
                    RunLoop.main.perform {
                        guard self.updateHandoffDirectory == directory, !self.quitting else { return }
                        guard !fm.fileExists(atPath: directory.appendingPathComponent("cancelled").path),
                              expires > Date().timeIntervalSince1970 * 1000, Darwin.kill(pid, 0) == 0 else {
                            self.updateHandoffFailed(directory, "The updater stopped before shutdown. The app is still running.")
                            return
                        }
                        self.updateHandoffDirectory = nil
                        NSApp.terminate(nil)
                    }
                    return
                }
            } catch { updateHandoffFailed(directory, error.localizedDescription); return }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.waitForUpdater(directory, deadline: deadline) }
    }

    private func updateHandoffFailed(_ directory: URL, _ message: String) {
        recordNativeDiagnostic("update", "native_update_failed")
        updateHandoffDirectory = nil
        try? "cancelled\n".write(to: directory.appendingPathComponent("cancelled"), atomically: true, encoding: .utf8)
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("proceed"))
        // Revocation prevents a late runner from treating a later ordinary quit as
        // permission to update. Leave claimed directories for timeout diagnostics.
        // Revoke before unloading: even a late runner cannot use an ordinary
        // later Quit as update authorization. Also unload jobs whose Node failed
        // to start, since those have no runner to clean themselves up.
        let cleanup = Process()
        cleanup.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        cleanup.arguments = ["bootout", "gui/\(getuid())/local.jumpybrain.updater.\(directory.lastPathComponent)"]
        cleanup.environment = maintenanceEnvironment
        cleanup.standardInput = FileHandle.nullDevice
        cleanup.standardOutput = FileHandle.nullDevice
        cleanup.standardError = FileHandle.nullDevice
        cleanup.terminationHandler = { child in
            guard child.terminationStatus == 0 else { return }
            for name in ["request.json", "update.plist", "menu-update.mjs"] {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
            }
        }
        // Give a cancelling runner a short grace period to flush its failure
        // result and clean up itself; bootout otherwise kills it mid-write.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { try? cleanup.run() }
        if let line = "Update handoff failed: \(message)\nDiagnostics: \(directory.path)\n".data(using: .utf8) {
            try? output?.write(contentsOf: line)
        }
        updating = false
        updateItem?.title = "Update jumpyBrain…"
        if updateCheck == nil { updateStatus.title = "Updates: not checked" }
        setStatus(statusLine.title, healthy: ready)
        showError("Could not start update", message)
    }

    @objc private func openMemory() {
        guard ready, !stopping, !switching, let child = server, child.isRunning else { return }
        // Recheck, rather than opening a stale local root after a browser switch.
        URLSession.shared.dataTask(with: controlRequest("/companion/state", timeout: 4)) { [weak self] data, response, error in
            let state = data.flatMap { try? JSONDecoder().decode(CompanionState.self, from: $0) }
            DispatchQueue.main.async {
                guard let self = self, self.server === child, !self.stopping, !self.quitting,
                      error == nil, (response as? HTTPURLResponse)?.statusCode == 200,
                      let state = state, state.active?.kind == "local", let root = state.active?.root else { return }
                var directory: ObjCBool = false
                if FileManager.default.fileExists(atPath: root, isDirectory: &directory), directory.boolValue {
                    NSWorkspace.shared.open(URL(fileURLWithPath: root))
                }
            }
        }.resume()
    }
    @objc private func showLogs() { NSWorkspace.shared.activateFileViewerSelecting([logURL]) }
    @objc private func quit() { NSApp.terminate(nil) }

    private func updateLoginState() {
        loginItem.state = FileManager.default.fileExists(atPath: config.launchAgent) ? .on : .off
    }

    @objc private func toggleLogin() {
        do {
            let fm = FileManager.default
            if fm.fileExists(atPath: config.launchAgent) {
                // Don't bootout the running GUI. Removing the plist disables the NEXT login.
                try fm.removeItem(atPath: config.launchAgent)
            } else {
                let plist: [String: Any] = [
                    "Label": config.label,
                    "ProgramArguments": [Bundle.main.executablePath!],
                    "RunAtLoad": true,
                    "KeepAlive": false,
                    "ProcessType": "Interactive",
                    "LimitLoadToSessionType": "Aqua",
                    "AssociatedBundleIdentifiers": ["local.jumpybrain.companion"],
                    "StandardOutPath": config.supportDirectory + "/companion.log",
                    "StandardErrorPath": config.supportDirectory + "/companion.log"
                ]
                let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
                try fm.createDirectory(at: URL(fileURLWithPath: config.launchAgent).deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: URL(fileURLWithPath: config.launchAgent), options: .atomic)
                try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: config.launchAgent)
            }
            updateLoginState()
        } catch { showError("Could not change login setting", error.localizedDescription) }
    }

    private func confirm(_ title: String, _ text: String, _ action: String) -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: action)
        return alert.runModal() == .alertSecondButtonReturn
    }

    private func showError(_ title: String, _ text: String) {
        if desktopHost { fputs("jumpyBrain internal host failed; see private diagnostics.\n", stderr); return }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.runModal()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openEditor()
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !ownsLock || config == nil { return .terminateNow }
        if quitting { return .terminateLater }
        quitting = true
        parentTimer?.invalidate()
        healthTimer?.invalidate()
        updateTimer?.invalidate()
        if let check = updateCheck, check.isRunning { check.terminate() }
        stopServer { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let companion = Companion()
app.delegate = companion
app.run()
