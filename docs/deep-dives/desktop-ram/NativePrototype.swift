// Disposable WKWebView experiment. No installer, login registration or host migration.
import Cocoa
import WebKit

enum ProbeError: Error { case failed(String) }
@MainActor final class Prototype: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var config: [String: Any] = [:]
    var host: Process?, window: NSWindow?, web: WKWebView?
    var key = "", origin = "", quitting = false
    var log: FileHandle!
    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { do { try await run() } catch { emit("failure", ["error": String(describing:error)]); host?.terminate(); NSApp.terminate(nil) } }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func emit(_ type: String, _ fields: [String:Any] = [:]) {
        var event = fields; event["type"] = type; event["timeMs"] = Date().timeIntervalSince1970 * 1000
        if let bytes = try? JSONSerialization.data(withJSONObject:event) { try? log?.write(contentsOf:bytes); try? log?.write(contentsOf:Data([10])) }
    }
    func pause(_ seconds: Double) async throws { try await Task.sleep(nanoseconds:UInt64(seconds * 1e9)) }
    func request(_ route: String, _ body: [String:Any]? = nil) async throws -> [String:Any] {
        var req = URLRequest(url:URL(string:origin + "/companion/" + route)!)
        req.setValue("Bearer " + key, forHTTPHeaderField:"Authorization"); req.timeoutInterval = 30
        if let body = body { req.httpMethod = "POST"; req.setValue("application/json",forHTTPHeaderField:"Content-Type"); req.httpBody = try JSONSerialization.data(withJSONObject:body) }
        let (data,response) = try await URLSession.shared.data(for:req)
        guard (response as? HTTPURLResponse)?.statusCode == 200, let object = try JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw ProbeError.failed("Control request failed: " + route) }
        return object
    }
    func js(_ source: String) async throws -> Any {
        guard let web = web else { throw ProbeError.failed("No web view") }
        return try await web.callAsyncJavaScript("return await (" + source + ");", arguments:[:], in:nil, contentWorld:.page) as Any
    }
    func until(_ source: String) async throws {
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline { if (try? await js(source)) as? Bool == true { return }; try await pause(0.1) }
        throw ProbeError.failed("Web readiness timed out")
    }
    func stage(_ name: String, _ operation: () async throws -> Void) async throws {
        emit("start",["name":name]); let start = Date()
        try await operation(); emit("operation-end",["name":name,"latencyMs":Date().timeIntervalSince(start)*1000])
        try await pause(config["settleSeconds"] as? Double ?? 15)
        var telemetry: [String:Any] = ["windows":window == nil ? 0:1]
        if web != nil { telemetry["renderer"] = try await js("({view:state.view,graphNodes:state.graph?.nodes?.length||0,graphDom:document.querySelectorAll('[data-testid=graph-node]').length,scale:devicePixelRatio,viewport:[innerWidth,innerHeight]})") }
        emit("end",["name":name,"telemetry":telemetry])
    }
    func openWindow() async throws {
        let settings = WKWebViewConfiguration(); settings.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame:NSRect(x:0,y:0,width:1280,height:820), configuration:settings)
        let win = NSWindow(contentRect:view.frame, styleMask:[.titled,.closable,.miniaturizable,.resizable], backing:.buffered, defer:false)
        win.isReleasedWhenClosed = false; win.delegate = self; win.title = "jumpyBrain RAM prototype"
        win.contentView = view; window = win; web = view; win.makeKeyAndOrderFront(nil)
        view.load(URLRequest(url:URL(string:origin + "/#companion=" + key)!))
        try await until("typeof companionRegistered!=='undefined' && companionRegistered && !companionFrozen && !document.getElementById('recent-refresh').disabled")
    }
    func closeWindow() async throws {
        if web != nil {
            guard (try await js("state.editor ? state.editor.flush() : true")) as? Bool == true else { throw ProbeError.failed("Draft did not save") }
            // Dispose the page explicitly so the shared browser contract unregisters its tab.
            _ = try await js("(()=>{if(typeof companionUnregister==='function')companionUnregister();return true})()")
            web?.loadHTMLString("<!doctype html><title>Closed</title>",baseURL:nil)
            try await pause(0.5)
        }
        window?.close();window?.contentView = nil;web = nil;window = nil
    }
    func navigate(_ destination: String, _ view: String) async throws {
        let encoded = String(data:try JSONSerialization.data(withJSONObject:[destination]),encoding:.utf8)!
        _ = try await js("navigation.navigate(" + encoded + "[0])")
        try await until("state.view==='" + view + "' && " + (view == "graph" ? "!!state.graph && !document.getElementById('ready').hidden" : view == "note" ? "!!state.editor?.state.loaded && !document.getElementById('note-editor').hidden && document.getElementById('note-editor').isContentEditable" : "!document.getElementById('recent-refresh').disabled"))
    }
    func run() async throws {
        let file = CommandLine.arguments.last!
        config = try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:file))) as! [String:Any]
        let events = config["events"] as! String
        FileManager.default.createFile(atPath:events,contents:nil,attributes:[.posixPermissions:0o600])
        log = try FileHandle(forWritingTo:URL(fileURLWithPath:events));emit("launched",["pid":ProcessInfo.processInfo.processIdentifier])
        // Give the external sampler time to attach before any child starts.
        try await pause(2)
        let resources = config["resources"] as! String, support = config["support"] as! String
        key = try String(contentsOfFile:support + "/api-key",encoding:.utf8)
        origin = "http://127.0.0.1:\(config["port"] as! Int)"
        try await stage("cold-background") {
            let child = Process();child.executableURL = URL(fileURLWithPath:resources + "/native/jumpyBrain Host.app/Contents/MacOS/jumpyBrain")
            child.arguments = ["--desktop-host"];child.environment = ["PATH":"/usr/bin:/bin:/usr/sbin:/sbin","LANG":"en_US.UTF-8","JUMPYBRAIN_DESKTOP_INSTANCE":UUID().uuidString.lowercased()]
            child.standardInput = FileHandle.nullDevice;child.standardOutput = FileHandle.nullDevice;child.standardError = FileHandle.nullDevice
            try child.run();host = child
            let end = Date().addingTimeInterval(30)
            while Date() < end { if (try? await request("state")) != nil { return };try await pause(0.1) }
            throw ProbeError.failed("Native host did not become ready")
        }
        try await stage("home") { try await openWindow() }
        if (config["count"] as? Int ?? 0) > 0 {
            try await stage("note-edit-save") {
                try await navigate("/?note=mem_a0000000-0000-4000-8000-000000000001","note")
                _ = try await js("(()=>{const el=document.getElementById('note-editor');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(range);return true})()")
                try await pause(0.1)
                // WebKit's native editing command reaches the same contenteditable/Lexical input path.
                _ = try await js("document.execCommand('insertText',false,' native-prototype-save')")
                try await until("richEditor.getMarkdown().includes('native-prototype-save')")
                guard (try await js("state.editor.flush()")) as? Bool == true else { throw ProbeError.failed("Save not confirmed") }
                let saved = try String(contentsOfFile:(config["root"] as! String) + "/notes/ram-00000.md",encoding:.utf8)
                guard saved.contains("native-prototype-save") else { throw ProbeError.failed("Canonical save missing") }
            }
        }
        try await stage("graph-pan-zoom-resize") {
            try await navigate("/graph","graph")
            _ = try await js("(()=>{map.zoomGraph(1.2);map.zoomGraph(1/1.2);state.pan={x:80,y:40};map.updateViewport();return true})()")
            for size in [NSSize(width:1600,height:1000),NSSize(width:800,height:600),NSSize(width:1280,height:820)] { window?.setContentSize(size);try await pause(0.3) }
        }
        try await stage("graph-exit") { try await navigate("/","home") }
        try await stage("minimized") { window?.miniaturize(nil);try await pause(0.7) }
        try await stage("restored") { window?.deminiaturize(nil);try await pause(0.7) }
        try await stage("closed-window") { try await closeWindow();_ = try await request("state") }
        try await stage("reopen") { try await openWindow() }
        try await stage("recovery") { try await pause(config["recoverySeconds"] as? Double ?? 300) }
        emit("start",["name":"explicit-quit"])
        let preparation = try await request("shutdown",["action":"prepare"])
        guard let id = preparation["id"] as? String else { throw ProbeError.failed("Missing shutdown lease") }
        try await closeWindow();_ = try await request("shutdown",["action":"commit","id":id])
        host?.terminate()
        let end = Date().addingTimeInterval(15)
        while host?.isRunning == true && Date() < end { try await pause(0.1) }
        guard host?.isRunning != true else { throw ProbeError.failed("Native host survived quit") }
        try Data("{\"ok\":true}".utf8).write(to:URL(fileURLWithPath:config["result"] as! String))
        emit("completed");NSApp.terminate(nil)
    }
}
MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = Prototype()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}
