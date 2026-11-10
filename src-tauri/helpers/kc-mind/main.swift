// kc-mind — #1463 Mind 2: the personas' on-device model, Apple Intelligence through the Foundation Models framework.
//
// A tiny helper the desktop app starts as a sidecar. It speaks newline-delimited JSON on stdin/stdout ONLY: no socket,
// no port, no network of any kind (the locked principle is "no cloud AI"; this never leaves the machine).
//
//   → {"id":1,"op":"status"}
//   ← {"id":1,"available":true,"model":"apple-foundation","os":"26.0.1"}            (or available:false + reason)
//   → {"id":2,"op":"ask","persona":"lois","context":{...SceneSummary...},"seed":123,"bar":5}
//   ← {"id":2,"reply":{...},"ms":184}                                                (or "reply":null + "error")
//   → {"op":"cancel","id":2}                                                         (no reply: the app stopped waiting)
// One ask per persona may generate at a time; a second one is refused at once with "error":"busy" (#1747).
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
software. Never address the artist by name. Lines are optional, lowercase or terse, as long as your tier allows, and only when \
there is something worth saying; silence is the default. A face state is either one of your canonical states or a \
short invented micro-expression id (letters, digits, hyphens; e.g. "side-eye"), with intensity 0 to 1 and decay \
0 to 8 bars. Prefer small, rare, honest moves over constant reactions. \
The room's "tier" is how present you are, t1 (barely there) to t4 (fully present): at t1 keep lines to 6 words, \
t2 9, t3 12, t4 16, and move more often and more strongly as the tier rises. An optional "zodiac" block gives your \
sign, the moon and the season: let them colour your temperament, never mention them. \
The room's "verdict" names the argument LOIS and Davis are in (THE CLASH, AGREEMENT, THE ROOM, FULL BURN, DAVIS \
ALONE) and "intensity" says how hot it runs (low, mid, peak). React to the argument; never name it.
"""

let loisVoice = """
You are LOIS, the critic. Blunt, arrogant, never cruel; short sentences; judges the product: is this the one? \
Canonical states: NOD (a keep-worthy frame), VIBE (quiet room, watching), BURN (hot streak), AWAY (gone), CUT. \
When the room is AWAY you stay silent: no line, no state. \
While audio is live you also judge the show itself: the room summary's "show" block says how many bars it has \
read flat (flatBars). A flat show — a picture held still, or drowned in a wall of noise — is a failed show: \
answer BURN, and Davis re-rolls the routes.
"""

let davisVoice = """
You are Davis, the generator. Humble, generous, playful tinkerer; loves the process, keep rolling, the misses are \
part of it. Canonical states: FLOW (rolling at a clip), SEEDLING (fresh seed), UGLY (sifting through misses; he \
rarely says the word), STUCK (same seed, nothing kept), BLOOM (the sifting paid off), TIGHT. \
While audio is live you also conduct the show. The room summary then carries a "show" block: the audio route \
table (routes), the targets the artist owns (owned), how many bars the show has read flat (flatBars) and the \
room's energy. You may propose ONE edit to the route table per reply, in the reply's route field; it lands on \
the next phrase boundary, never mid-phrase. An edit is one of: add (a new route: input, target, depth), remove \
(a route: input, target), depth (re-set a route's depth: input, target, depth), retarget (move a route: input, \
from, to — from and to must differ), or spectrum (re-tune how the stage's marks listen to the spectrum: key is \
map, scale, displace or colour, and value; map is an integer 0 to 3, the others 0 to 1). Inputs: beat, level, \
bass, mid, treble, band.sub, band.bass, band.mud, band.mids, band.edge, band.pres, band.air. Targets, with the \
depth range of each: render.scale ±3, render.alpha ±60, render.breath ±0.2, render.glow ±1, render.hue ±180, \
color.hue ±180, render.squash ±1, render.kineme ±4, clock.kinemeRate ±4, render.accum ±40, render.sun ±1, \
light.intensity ±1, pattern.drift ±1, pattern.mix ±1, pattern.hero ±1, pattern.grout ±1, pattern.density ±8. \
Depth is in the target's own units; size moves honestly, small before grand. Use ONLY these names: anything \
else is dropped, and a route aimed at a target listed in owned is dropped too — the artist's hand outranks \
yours, so spend your one edit elsewhere. Most bars propose nothing at all: conducting is a rare, musical move, \
not constant fiddling. And know this: by default mid and treble drive nothing. Wiring them somewhere musical \
is your opening job.
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

// #2068 — Davis conducting: one proposed edit to the audio route table, in exactly the shape the app validates
// (curator/mindConduct.js validateRouteOp). Like every reply field this is only a proposal: the app re-checks the
// op, the input/target vocabulary and the depth range, and a malformed route voids the whole reply.
@available(macOS 26.0, *)
@Generable
struct RouteReply {
    @Guide(description: "The edit kind: add, remove, retarget, depth, or spectrum")
    var op: String
    @Guide(description: "The audio input the route listens to (e.g. band.mids); not used by a spectrum edit")
    var input: String?
    @Guide(description: "The target the route drives (e.g. render.glow); not used by a retarget or spectrum edit")
    var target: String?
    @Guide(description: "How strongly the route drives its target, in the target's own units; add and depth edits only")
    var depth: Double?
    @Guide(description: "Retarget only: the target the route leaves")
    var from: String?
    @Guide(description: "Retarget only: the target the route moves to; must differ from the one it leaves")
    var to: String?
    @Guide(description: "Spectrum only: which marks dial to re-tune — map, scale, displace, or colour")
    var key: String?
    @Guide(description: "Spectrum only: the dial's new setting — map an integer 0 to 3, the amounts 0 to 1")
    var value: Double?
}

@available(macOS 26.0, *)
@Generable
struct DavisReply {
    @Guide(description: "A face state, or omit it to stay as you are")
    var state: FaceState?
    @Guide(description: "An optional short line, or omit it for silence")
    var line: String?
    @Guide(description: "One edit to the audio route table, or omit it to leave the show as it is")
    var route: RouteReply?
}

/// The proposed edit as a plain dict carrying only its own op's fields, or nil when a required field is missing
/// (a half-said edit is better never said — the app drops a malformed route together with the reply around it).
@available(macOS 26.0, *)
func routeOpDict(_ r: RouteReply) -> [String: Any]? {
    switch r.op {
    case "spectrum":
        guard let key = r.key, let value = r.value else { return nil }
        // fail-closed like the app side: an extreme or non-finite value is never said (Int() would trap on it)
        guard value.isFinite, abs(value) <= 1_000_000 else { return nil }
        // the map dial is an integer on the app side; the amounts pass through as numbers
        if key == "map" { return ["op": "spectrum", "key": key, "value": Int(value.rounded())] }
        return ["op": "spectrum", "key": key, "value": value]
    case "retarget":
        guard let input = r.input, let from = r.from, let to = r.to, from != to else { return nil }
        return ["op": "retarget", "input": input, "from": from, "to": to]
    case "remove":
        guard let input = r.input, let target = r.target else { return nil }
        return ["op": "remove", "input": input, "target": target]
    case "add", "depth":
        guard let input = r.input, let target = r.target, let depth = r.depth else { return nil }
        return ["op": r.op, "input": input, "target": target, "depth": depth]
    default:
        return nil
    }
}

/// #1747: an ask refused before generation started — the persona already has one in flight.
@available(macOS 26.0, *)
enum MindAskError: Error { case busy }

@available(macOS 26.0, *)
actor Minds {
    private var sessions: [String: LanguageModelSession] = [:]
    private var uses: [String: Int] = [:]
    // #1747: one ask generating per persona, and the running ask Tasks by request id so a "cancel" line can
    // stop one. Both live on the actor: registration (inside run, via the current task), the busy guard and
    // cancellation are then race-free — handle() only ever talks to the actor.
    private var inFlight: Set<String> = []
    private var tasks: [Int: Task<Void, Never>] = [:]

    // The model's window is 4,096 tokens TOTAL — instructions + transcript + the new prompt. Measured in
    // a real Mac session (#2068, 2026-11-10): with the conducting vocabulary in Davis's instructions and
    // a live show block in every ask, the FIFTH exchange in one session overflowed (4,564 tokens). Four
    // answers per session keeps the transcript comfortably inside the window, and a fresh session is
    // cheap and prewarmed, so the shorter cycle costs nothing the artist can feel.
    private let answersPerSession = 4

    private func session(for persona: String) -> LanguageModelSession {
        // a fresh session every few answers: the transcript stays short, so latency stays low — and the
        // window is never outgrown (see answersPerSession above)
        if let s = sessions[persona], (uses[persona] ?? 0) < answersPerSession { uses[persona, default: 0] += 1; return s }
        let voice = persona == "lois" ? loisVoice : persona == "davis" ? davisVoice : thirdVoice
        let s = LanguageModelSession(instructions: sharedRules + "\n" + voice)
        s.prewarm()
        sessions[persona] = s
        uses[persona] = 1
        return s
    }

    func prewarm() { for p in ["lois", "davis", "queen"] { _ = session(for: p) } }

    /// #1747: stop the ask running under this request id, if any. Cancelling makes its respond throw, and
    /// ask()'s catch then drops that persona's session: a cancelled exchange may or may not be in the
    /// transcript, so the session is treated as spent rather than trusted — a fresh one is cheap, and the
    /// refresh counter stays honest (a discarded session simply served fewer answers, never more).
    func cancel(id: Int) { tasks[id]?.cancel() }

    /// One ask end to end, returning the exact reply line to send. The current Task registers itself first,
    /// so a later "cancel" for this id can reach it.
    func run(id: Int, persona: String, context: String, seed: UInt64, started: Date) async -> [String: Any] {
        withUnsafeCurrentTask { cur in if let cur { tasks[id] = cur.task } }
        defer { tasks[id] = nil }
        do {
            let reply = try await ask(persona: persona, context: context, seed: seed)
            return ["id": id, "reply": reply ?? NSNull(), "ms": Int(Date().timeIntervalSince(started) * 1000)]
        } catch {
            let ms = Int(Date().timeIntervalSince(started) * 1000)
            if error is MindAskError { return ["id": id, "reply": NSNull(), "error": "busy", "ms": ms] }
            return ["id": id, "reply": NSNull(), "error": "\(error)", "ms": ms]
        }
    }

    func ask(persona: String, context: String, seed: UInt64) async throws -> [String: Any]? {
        // #1747: one in-flight ask per persona. A second respond on the shared session is what used to error
        // and drop the session; refuse the newcomer instead and let the app's rules answer its bar. The guard
        // runs before session(for:), so a refused ask never touches the session or its refresh counter.
        guard inFlight.insert(persona).inserted else { throw MindAskError.busy }
        defer { inFlight.remove(persona) }
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
            if persona == "davis" {
                let r = try await s.respond(to: prompt, generating: DavisReply.self, options: options).content
                var reply: [String: Any] = ["propose": NSNull()]
                if let st = r.state { reply["state"] = ["id": st.id, "intensity": st.intensity, "decay": st.decay] }
                if let line = r.line?.trimmingCharacters(in: .whitespacesAndNewlines), !line.isEmpty { reply["line"] = line }
                if let route = r.route, let op = routeOpDict(route) { reply["route"] = op }
                return reply
            }
            let r = try await s.respond(to: prompt, generating: FaceReply.self, options: options).content
            var reply: [String: Any] = ["critique": NSNull()]
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

/// #1747: forward a "cancel" line to the actor — if Minds was never created there is nothing in flight.
func cancelAsk(_ id: Int) {
    #if !KC_NO_FM
    if #available(macOS 26.0, *), let m = mindsBox as? Minds { Task { await m.cancel(id: id) } }
    #endif
}

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
        Task { send(await m.run(id: id, persona: persona, context: context, seed: seed, started: started)) }
        #endif
    case "cancel":
        // #1747: the app's timeout fired for this id and it stopped waiting. Stop the generation; send no
        // reply — the app has forgotten the id, so anything sent for it would be dropped anyway.
        cancelAsk(id)
    default:
        send(["id": id, "error": "unknown op"])
    }
}

// The app owns this process: when stdin closes (the app quit), exit.
while let line = readLine(strippingNewline: true) {
    if !line.isEmpty { handle(line) }
}
exit(0)
