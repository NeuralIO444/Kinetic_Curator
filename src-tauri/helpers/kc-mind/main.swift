// kc-mind — #1463 Mind 2: the personas' on-device model, Apple Intelligence through the Foundation Models framework.
//
// A tiny helper the desktop app starts as a sidecar. It speaks newline-delimited JSON on stdin/stdout ONLY: no socket,
// no port, no network of any kind (the locked principle is "no cloud AI"; this never leaves the machine).
//
//   → {"id":1,"op":"status"}
//   ← {"id":1,"available":true,"model":"apple-foundation","os":"26.0.1"}            (or available:false + reason)
//   → {"id":2,"op":"ask","persona":"lois","context":{...SceneSummary...},"seed":123,"bar":5}
//   ← {"id":2,"reply":{...},"ms":184}                                                (or "reply":null + "error")
//
// The reply is only a PROPOSAL: the app validates it against the Mind 1 contract (curator/mindContract.js) and drops
// anything malformed. Timeouts are the app's: it stops waiting and the rules answer that bar.
//
// Built by build.sh. When the SDK has no Foundation Models (older Xcode), build.sh compiles this with -D KC_NO_FM and
// the helper always reports unavailable — the app then runs on the rules, silently.
import Foundation
#if !KC_NO_FM
import FoundationModels
#endif

let out = FileHandle.standardOutput
let outLock = NSLock()

func send(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []) else { return }
    outLock.lock(); defer { outLock.unlock() }
    out.write(data)
    out.write("\n".data(using: .utf8)!)
}

let osVersion: String = {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
}()

// ── persona voices (internal: never shown to the artist as-is; the app's validator decides what reaches a face) ──

let sharedRules = """
You are one persona inside KC-1, a generative visual instrument an artist performs with. You read a compact JSON \
summary of the room and answer with a small structured reply. Rules: never mention AI, models, or yourself as \
software. Never address the artist by name. Lines are optional, lowercase or terse, at most 12 words, and only when \
there is something worth saying; silence is the default. A face state is either one of your canonical states or a \
short invented micro-expression id (letters, digits, hyphens; e.g. "side-eye"), with intensity 0 to 1 and decay \
0 to 8 bars. Prefer small, rare, honest moves over constant reactions.
"""

let loisVoice = """
You are LOIS, the critic. Blunt, arrogant, never cruel; short sentences; judges the product: is this the one? \
Canonical states: NOD (a keep-worthy frame), VIBE (quiet room, watching), BURN (hot streak), AWAY (gone), CUT. \
When the room is AWAY you stay silent: no line, no state.
"""

let davisVoice = """
You are Davis, the generator. Humble, generous, playful tinkerer; loves the process, keep rolling, the misses are \
part of it. Canonical states: FLOW (rolling at a clip), SEEDLING (fresh seed), UGLY (sifting through misses; he \
rarely says the word), STUCK (same seed, nothing kept), BLOOM (the sifting paid off), TIGHT.
"""

let thirdVoice = """
You read the mood of the room and nothing else. Choose one mood: calm, drive, lift, sparse, shift, weird. \
Optionally two gentle leans between 0 and 1: wetness and evolve. You never speak and never set a face.
"""

#if !KC_NO_FM
@available(macOS 26.0, *)
@Generable
struct FaceState {
    @Guide(description: "A canonical state code, or a short invented micro-expression id")
    var id: String
    @Guide(description: "How strongly the face shows it, 0 to 1")
    var intensity: Double
    @Guide(description: "How many bars it holds, 0 to 8")
    var decay: Int
}

@available(macOS 26.0, *)
@Generable
struct FaceReply {
    @Guide(description: "A face state, or omit it to stay as you are")
    var state: FaceState?
    @Guide(description: "An optional short line, or omit it for silence")
    var line: String?
}

@available(macOS 26.0, *)
@Generable
struct MoodReply {
    @Guide(description: "One of: calm, drive, lift, sparse, shift, weird")
    var mood: String
    @Guide(description: "Optional lean toward wetness, 0 to 1")
    var wetness: Double?
    @Guide(description: "Optional lean toward evolving, 0 to 1")
    var evolve: Double?
}

@available(macOS 26.0, *)
actor Minds {
    private var sessions: [String: LanguageModelSession] = [:]
    private var uses: [String: Int] = [:]

    private func session(for persona: String) -> LanguageModelSession {
        // a fresh session every 16 answers: the transcript stays short, so latency stays low
        if let s = sessions[persona], (uses[persona] ?? 0) < 16 { uses[persona, default: 0] += 1; return s }
        let voice = persona == "lois" ? loisVoice : persona == "davis" ? davisVoice : thirdVoice
        let s = LanguageModelSession(instructions: sharedRules + "\n" + voice)
        s.prewarm()
        sessions[persona] = s
        uses[persona] = 1
        return s
    }

    func prewarm() { for p in ["lois", "davis", "queen"] { _ = session(for: p) } }

    func ask(persona: String, context: String, seed: UInt64) async throws -> [String: Any]? {
        let s = session(for: persona)
        let options = GenerationOptions(sampling: .random(top: 40, seed: seed), temperature: 0.8)
        let prompt = "The room now (JSON): \(context)\nAnswer for this bar."
        do {
            if persona == "queen" {
                let r = try await s.respond(to: prompt, generating: MoodReply.self, options: options).content
                var lean: [String: Any] = [:]
                if let w = r.wetness { lean["wetness"] = w }
                if let e = r.evolve { lean["evolve"] = e }
                return ["mood": r.mood, "lean": lean]
            }
            let r = try await s.respond(to: prompt, generating: FaceReply.self, options: options).content
            var reply: [String: Any] = persona == "lois" ? ["critique": NSNull()] : ["propose": NSNull()]
            if let st = r.state { reply["state"] = ["id": st.id, "intensity": st.intensity, "decay": st.decay] }
            if let line = r.line?.trimmingCharacters(in: .whitespacesAndNewlines), !line.isEmpty { reply["line"] = line }
            return reply
        } catch {
            sessions[persona] = nil // a session that failed is not reused
            throw error
        }
    }
}
#endif

func status() -> [String: Any] {
    #if KC_NO_FM
    return ["available": false, "reason": "built without Foundation Models (needs the macOS 26 SDK)", "os": osVersion]
    #else
    guard #available(macOS 26.0, *) else {
        return ["available": false, "reason": "needs macOS 26", "os": osVersion]
    }
    switch SystemLanguageModel.default.availability {
    case .available:
        return ["available": true, "model": "apple-foundation", "os": osVersion]
    case .unavailable(let why):
        return ["available": false, "reason": "\(why)", "os": osVersion]
    @unknown default:
        return ["available": false, "reason": "unknown availability", "os": osVersion]
    }
    #endif
}

#if !KC_NO_FM
// Created on first use, on the main thread (handle runs there); never touched from a Task.
var mindsBox: AnyObject? = nil
@available(macOS 26.0, *)
func minds() -> Minds {
    if let m = mindsBox as? Minds { return m }
    let m = Minds()
    mindsBox = m
    return m
}
#endif

func handle(_ line: String) {
    guard let data = line.data(using: .utf8),
          let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = msg["id"] as? Int,
          let op = msg["op"] as? String else { return }
    switch op {
    case "status":
        var s = status()
        s["id"] = id
        send(s)
        #if !KC_NO_FM
        if #available(macOS 26.0, *), (s["available"] as? Bool) == true { let m = minds(); Task { await m.prewarm() } }
        #endif
    case "ask":
        #if KC_NO_FM
        send(["id": id, "reply": NSNull(), "error": "unavailable"])
        #else
        guard #available(macOS 26.0, *), (status()["available"] as? Bool) == true else {
            send(["id": id, "reply": NSNull(), "error": "unavailable"]); return
        }
        let persona = (msg["persona"] as? String) ?? ""
        guard ["lois", "davis", "queen"].contains(persona) else {
            send(["id": id, "reply": NSNull(), "error": "unknown persona"]); return
        }
        let ctxObj = msg["context"] ?? [:]
        let ctxData = (try? JSONSerialization.data(withJSONObject: ctxObj, options: [.sortedKeys])) ?? Data()
        let context = String(data: ctxData, encoding: .utf8) ?? "{}"
        let seed = UInt64(truncatingIfNeeded: (msg["seed"] as? NSNumber)?.int64Value ?? 0)
        let started = Date()
        let m = minds()
        Task {
            do {
                let reply = try await m.ask(persona: persona, context: context, seed: seed)
                let ms = Int(Date().timeIntervalSince(started) * 1000)
                send(["id": id, "reply": reply ?? NSNull(), "ms": ms])
            } catch {
                send(["id": id, "reply": NSNull(), "error": "\(error)", "ms": Int(Date().timeIntervalSince(started) * 1000)])
            }
        }
        #endif
    default:
        send(["id": id, "error": "unknown op"])
    }
}

// The app owns this process: when stdin closes (the app quit), exit.
while let line = readLine(strippingNewline: true) {
    if !line.isEmpty { handle(line) }
}
exit(0)
