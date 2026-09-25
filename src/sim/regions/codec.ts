/**
 * Base64 packing for typed tile arrays in committed region JSON (SPEC §4.3 step 5: "compact:
 * run-length or base64-packed tile arrays"). Shared between `tools/mapgen` (encode, Node) and the
 * game's region loader (decode, browser/vitest) so the two sides can't drift — both `atob`/`btoa`
 * are available as globals in both environments (Node 18+ and every supported browser).
 */

export function encodeUint8(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}

export function decodeUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Packs a continuous elevation field as fixed-point Int16 (value * SCALE), for compactness. */
export const ELEVATION_RAW_SCALE = 10_000;

export function encodeElevationRaw(values: Float32Array): string {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    const scaled = Math.round((values[i] as number) * ELEVATION_RAW_SCALE);
    const clamped = Math.max(-32768, Math.min(32767, scaled));
    view.setInt16(i * 2, clamped, true);
  }
  return encodeUint8(bytes);
}

export function decodeElevationRaw(b64: string, length: number): Float32Array {
  const bytes = decodeUint8(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = view.getInt16(i * 2, true) / ELEVATION_RAW_SCALE;
  }
  return out;
}
