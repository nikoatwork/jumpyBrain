import AppKit
import Darwin

// Local prototype: UI/process lifecycle only. All memory behavior stays in the CLI.
struct Configuration: Decodable {
    let node: String
    let qmd: String
    let memoryRoot: String
    let supportDirectory: String
    let launchAgent: String
    let label: String
    let port: Int
    let revision: String
}

final class Companion: NSObject, NSApplicationDelegate {
    private var config: Configuration!
    private var statusItem: NSStatusItem!
    private let statusLine = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
    private var openItem: NSMenuItem!
    private var restartItem: NSMenuItem!
    private var indexItem: NSMenuItem!
    private var loginItem: NSMenuItem!
    private var server: Process?
    private var indexer: Process?
    private var output: FileHandle?
    private var healthTimer: Timer?
    private var signals: [DispatchSourceSignal] = []
    private var healthInFlight = false
    private var ready = false
    private var stopping = false
    private var quitting = false
    private var forcedQuit = false
    private var lockFD: Int32 = -1
    private var ownsLock = false
    private var apiKey = ""
    private var startupTime = Date()
    private var openWhenReady = false
    private var baseURL: String { "http://127.0.0.1:\(config.port)" }
    private var logURL: URL { URL(fileURLWithPath: config.supportDirectory).appendingPathComponent("server.log") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let url = Bundle.main.url(forResource: "Configuration", withExtension: "json")!
            config = try JSONDecoder().decode(Configuration.self, from: Data(contentsOf: url))
            // Lock is NOT inherited by Node. A second app must never adopt/kill another server.
            lockFD = Darwin.open(config.supportDirectory + "/companion.lock", O_CREAT | O_RDWR | O_CLOEXEC, 0o600)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
                NSApp.terminate(nil)
                return
            }
            ownsLock = true
            openWhenReady = ProcessInfo.processInfo.arguments.contains("--open-editor")
            apiKey = try String(contentsOfFile: config.supportDirectory + "/api-key", encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard apiKey.count == 64, apiKey.allSatisfy({ $0.isHexDigit }) else {
                throw NSError(domain: "Companion", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing/invalid local key. Re-run install.py."])
            }
            makeMenu()
            prepareLog()
            for sig in [SIGTERM, SIGINT] {
                signal(sig, SIG_IGN)
                let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
                source.setEventHandler { [weak self] in
                    self?.forcedQuit = true
                    // terminateLater may enter a nested AppKit loop. Don't call it
                    // inside a main-queue block that would starve shutdown callbacks.
                    RunLoop.main.perform { NSApp.terminate(nil) }
                }
                source.resume()
                signals.append(source)
            }
            startServer()
            healthTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.checkHealth() }
        } catch {
            showError("Could not start jumpyBrain", error.localizedDescription)
            forcedQuit = true
            NSApp.terminate(nil)
        }
    }

    private func makeMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.autoenablesItems = false
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        let address = NSMenuItem(title: baseURL, action: nil, keyEquivalent: "")
        address.isEnabled = false
        menu.addItem(address)
        menu.addItem(.separator())
        openItem = add(menu, "Open Editor in Chrome", #selector(openEditor), "o")
        restartItem = add(menu, "Restart Server…", #selector(restartServer))
        indexItem = add(menu, "Refresh Search Index", #selector(refreshIndex))
        menu.addItem(.separator())
        _ = add(menu, "Open Memory Folder", #selector(openMemory))
        _ = add(menu, "Show Logs", #selector(showLogs))
        loginItem = add(menu, "Start at Login", #selector(toggleLogin))
        updateLoginState()
        menu.addItem(.separator())
        let build = NSMenuItem(title: "Local build · \(config.revision)", action: nil, keyEquivalent: "")
        build.isEnabled = false
        menu.addItem(build)
        _ = add(menu, "Quit jumpyBrain…", #selector(quit), "q")
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
        if statusLine.title != text {
            if let line = "\(Date().ISO8601Format()) companion: \(text)\n".data(using: .utf8) { try? output?.write(contentsOf: line) }
        }
        statusLine.title = text
        statusItem?.button?.image = NSImage(systemSymbolName: healthy ? "brain" : "exclamationmark.circle", accessibilityDescription: "jumpyBrain: \(text)")
        statusItem?.button?.image?.isTemplate = true
        statusItem?.button?.toolTip = "jumpyBrain — \(text)"
        openItem?.isEnabled = healthy && !stopping
        restartItem?.isEnabled = !stopping && indexer == nil
        indexItem?.isEnabled = healthy && !stopping && indexer == nil
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
        p.currentDirectoryURL = URL(fileURLWithPath: config.memoryRoot)
        // Do not inherit remote credentials or rely on interactive shell startup.
        p.environment = [
            "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
            "PATH": "\(URL(fileURLWithPath: config.node).deletingLastPathComponent().path):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "LANG": "en_US.UTF-8",
            "JUMPYBRAIN_QMD_BIN": config.qmd,
            "JUMPYBRAIN_SERVER_API_KEYS": apiKey,
            "JUMPYBRAIN_API_KEY": apiKey,
            "JUMPYBRAIN_NO_UPDATE_CHECK": "1"
        ]
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
        let bootstrap = Bundle.main.resourceURL!.appendingPathComponent("server-bootstrap.mjs").path
        let p = makeProcess([bootstrap, "serve", "--root", config.memoryRoot, "--host", "127.0.0.1", "--port", String(config.port)])
        p.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self = self, self.server === child else { return }
                self.server = nil
                if !self.stopping { self.setStatus("Server stopped (\(child.terminationStatus)) — see logs", healthy: false) }
            }
        }
        do {
            server = p
            startupTime = Date()
            try p.run()
            checkHealth()
        } catch {
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
        // This route verifies both the server and our dedicated key without note bodies.
        var request = URLRequest(url: URL(string: baseURL + "/memories/all/status")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 4)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let ok = error == nil && (response as? HTTPURLResponse)?.statusCode == 200 && json?["memory"] as? String == "all"
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.healthInFlight = false
                guard self.server === child, child.isRunning, !self.stopping, !self.quitting else { return }
                if ok {
                    self.setStatus("Running · Local memory", healthy: true)
                    if self.openWhenReady { self.openWhenReady = false; self.openEditor() }
                } else if Date().timeIntervalSince(self.startupTime) > 15 {
                    self.setStatus("Server not responding — see logs", healthy: false)
                }
            }
        }.resume()
    }

    // Stop only Process instances we created; never kill by port/name/stale PID.
    private func stopServer(_ completion: @escaping () -> Void) {
        stopping = true
        setStatus("Stopping…", healthy: false)
        let children = [server, indexer].compactMap { $0 }.filter { $0.isRunning }
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
        // Fragment is consumed/removed by the existing shell, never sent over HTTP.
        let url = URL(string: baseURL + "/#apiKey=" + apiKey)!
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
        guard indexer == nil else { return }
        guard server == nil || confirm("Restart local server?", "Wait for “Saved” in Chrome first. Browser-only drafts cannot be saved while the server is restarting.", "Restart") else { return }
        stopServer { [weak self] in self?.server = nil; self?.startServer() }
    }

    @objc private func refreshIndex() {
        guard indexer == nil, ready, !stopping else { return }
        let cli = Bundle.main.resourceURL!.appendingPathComponent("runtime/dist/cli.js").path
        // Go through the CLI's HTTP transport so the server serializes indexing
        // with its own auto-indexer and browser writes, instead of racing QMD.
        let p = makeProcess([cli, "index", "--target-url", baseURL])
        indexer = p
        indexItem.title = "Refreshing Search Index…"
        indexItem.isEnabled = false
        restartItem.isEnabled = false
        p.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.indexer = nil
                self.indexItem.title = "Refresh Search Index"
                self.indexItem.isEnabled = self.ready && !self.stopping
                self.restartItem.isEnabled = !self.stopping
                if child.terminationStatus != 0 && !self.quitting {
                    self.showError("Search refresh failed", "See Show Logs for details. Your Markdown files were not changed by indexing.")
                }
            }
        }
        do { try p.run() } catch {
            indexer = nil
            indexItem.title = "Refresh Search Index"
            indexItem.isEnabled = ready
            restartItem.isEnabled = true
            showError("Could not refresh search", error.localizedDescription)
        }
    }

    @objc private func openMemory() { NSWorkspace.shared.open(URL(fileURLWithPath: config.memoryRoot)) }
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
        if !forcedQuit && (server?.isRunning == true || indexer?.isRunning == true) {
            guard confirm("Quit jumpyBrain?", "Wait for “Saved” in Chrome first. This stops the local server, not Chrome. It will start again at your next login if Start at Login is checked.", "Quit") else { return .terminateCancel }
        }
        quitting = true
        healthTimer?.invalidate()
        stopServer { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let companion = Companion()
app.delegate = companion
app.run()
