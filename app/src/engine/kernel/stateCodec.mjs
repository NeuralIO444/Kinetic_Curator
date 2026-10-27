// stateCodec.mjs — #1367: typed-array ⇄ base64 for resolver state snapshots.
//
// A state snapshot lives inside a performance file (gzip JSON), so its bulky payloads —
// particle columns, delay buffers, fields — travel as base64 of the raw typed-array bytes,
// never as JSON number arrays (the spectrum section's encoding precedent, #1534). The codec
// is isomorphic: the same code encodes in the browser at capture time and decodes in Node
// at verify time. Every decoder is fail-closed: wrong length, wrong kind, or dirty base64
// returns null, never a best-effort array.
//
// Byte order is the host's (little-endian on every platform KC-1 runs on); a snapshot is a
// same-take artifact, restored by the same build that recorded it — kernelVersion in the
// performance file already gates cross-version replay.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = new Map([...B64].map((c, i) => [c, i]));

/** Uint8Array -> base64 (chunked string ops only: browser and Node identical). */
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

/** base64 -> Uint8Array, or null for anything that is not clean base64. */
export function base64ToBytes(s) {
  if (typeof s !== 'string' || s.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(s)) return null;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n0 = B64_REV.get(s[i]);
    const n1 = B64_REV.get(s[i + 1]);
    const n2 = s[i + 2] === '=' ? 0 : B64_REV.get(s[i + 2]);
    const n3 = s[i + 3] === '=' ? 0 : B64_REV.get(s[i + 3]);
    if (n0 === undefined || n1 === undefined || n2 === undefined || n3 === undefined) return null;
    if (o < out.length) out[o++] = ((n0 << 2) | (n1 >> 4)) & 0xff;
    if (o < out.length) out[o++] = (((n1 & 15) << 4) | (n2 >> 2)) & 0xff;
    if (o < out.length) out[o++] = (((n2 & 3) << 6) | n3) & 0xff;
  }
  return out;
}

const KIND_BYTES = { f64: 8, f32: 4, i32: 4, u8: 1 };
const KIND_CTOR = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u8: Uint8Array };

/** Encode a typed array as { kind, length, b64 }. The array's own kind is authoritative. */
export function encodeTyped(arr) {
  const kind =
    arr instanceof Float64Array
      ? 'f64'
      : arr instanceof Float32Array
        ? 'f32'
        : arr instanceof Int32Array
          ? 'i32'
          : arr instanceof Uint8Array
            ? 'u8'
            : null;
  if (!kind)
    throw new Error(`[stateCodec] cannot encode ${arr && arr.constructor ? arr.constructor.name : typeof arr}`);
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  return { kind, length: arr.length, b64: bytesToBase64(bytes) };
}

/** Decode an encodeTyped record back to a fresh typed array, or null (fail-closed). */
export function decodeTyped(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const { kind, length, b64 } = rec;
  if (!KIND_BYTES[kind] || !Number.isInteger(length) || length < 0) return null;
  const bytes = base64ToBytes(b64);
  if (!bytes || bytes.length !== length * KIND_BYTES[kind]) return null;
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return new KIND_CTOR[kind](buf);
}

/**
 * Decode into an EXISTING typed array (the restore path: systems keep their buffers,
 * snapshots fill them). Returns false without touching the target on any mismatch.
 */
export function decodeTypedInto(rec, target) {
  const fresh = decodeTyped(rec);
  if (!fresh || fresh.length !== target.length || fresh.constructor !== target.constructor) return false;
  target.set(fresh);
  return true;
}
