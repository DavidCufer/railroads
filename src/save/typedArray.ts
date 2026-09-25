/**
 * Lossless base64 packing for typed arrays (SPEC §13: "tile arrays packed as base64 typed
 * arrays"). Unlike src/sim/regions/codec.ts (which deliberately uses a lossy fixed-point Int16
 * encoding for elevationRaw to hit the committed region JSON's <300KB budget), saves have a much
 * looser <2MB target and must round-trip *exactly* — the save/load determinism test compares
 * state deep-equal — so this packs every typed array's raw bytes with no precision loss.
 */

export function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000; // avoid a stack-overflow from String.fromCharCode(...hugeArray)
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function decodeBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type TypedArray = Uint8Array | Uint16Array | Int16Array | Int32Array | Float32Array;

export function encodeTypedArray(arr: TypedArray): string {
  return encodeBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Slice so the returned buffer starts at byte 0 with an exact length, regardless of the
  // Uint8Array's own byteOffset/backing-buffer size (decodeBytes always returns a fresh buffer
  // sized to `bytes`, so this is only defensive, not load-bearing today).
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function decodeUint8Array(b64: string): Uint8Array {
  return new Uint8Array(toArrayBuffer(decodeBytes(b64)));
}

export function decodeInt16Array(b64: string): Int16Array {
  return new Int16Array(toArrayBuffer(decodeBytes(b64)));
}

export function decodeUint16Array(b64: string): Uint16Array {
  return new Uint16Array(toArrayBuffer(decodeBytes(b64)));
}

export function decodeInt32Array(b64: string): Int32Array {
  return new Int32Array(toArrayBuffer(decodeBytes(b64)));
}

export function decodeFloat32Array(b64: string): Float32Array {
  return new Float32Array(toArrayBuffer(decodeBytes(b64)));
}
