// PATCH 026A.6 — Canvas capture validator (pure code, no DOM, no network).
//
// The server never trusts the client's word that a capture is real. This
// module decodes a PNG's actual pixel data (a minimal, dependency-free
// decoder — Node has zlib built in for the DEFLATE stream, but no PNG chunk/
// filter support) and rejects an empty or single-flat-color image before it
// is ever stored as a designer-session artifact — see this patch's global
// rule "never a silent skip and never a blank image passed on as success".
//
// Scope: 8-bit, non-interlaced PNGs with color type 0 (grayscale), 2 (RGB),
// 4 (grayscale+alpha), or 6 (RGBA) — what a browser canvas/Penpot export
// actually produces. Anything else (palette color, 16-bit, interlaced)
// fails with a clear "unsupported PNG variant" reason rather than silently
// misreading pixel data.

import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function channelsForColorType(colorType) {
  switch (colorType) {
    case 0: return 1; // grayscale
    case 2: return 3; // RGB
    case 4: return 2; // grayscale + alpha
    case 6: return 4; // RGBA
    default: return null; // 3 = palette, unsupported here
  }
}

/**
 * decodePng(buffer) -> { width, height, channels, pixels }
 * `pixels` is a flat Uint8Array of raw (unfiltered) samples, row-major,
 * `channels` samples per pixel. Throws a descriptive Error on anything
 * outside this module's supported scope (see header) or a malformed PNG.
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG file (bad signature)");
  }

  let offset = 8;
  let ihdr = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error("truncated PNG chunk");
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9),
        interlace: data.readUInt8(12),
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  if (!ihdr) throw new Error("PNG has no IHDR chunk");
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported PNG variant: bitDepth ${ihdr.bitDepth} (only 8-bit supported)`);
  if (ihdr.interlace !== 0) throw new Error("unsupported PNG variant: interlaced");
  const channels = channelsForColorType(ihdr.colorType);
  if (!channels) throw new Error(`unsupported PNG variant: colorType ${ihdr.colorType} (palette/unsupported)`);
  if (idatChunks.length === 0) throw new Error("PNG has no IDAT data");

  const compressed = Buffer.concat(idatChunks);
  const inflated = zlib.inflateSync(compressed);

  const bytesPerPixel = channels; // 8-bit depth => 1 byte/sample
  const rowBytes = ihdr.width * bytesPerPixel;
  const pixels = new Uint8Array(ihdr.width * ihdr.height * bytesPerPixel);
  let prevRow = new Uint8Array(rowBytes);
  let readOffset = 0;

  for (let y = 0; y < ihdr.height; y++) {
    const filterType = inflated[readOffset];
    readOffset += 1;
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const raw = inflated[readOffset + x];
      const a = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;
      let value;
      switch (filterType) {
        case 0: value = raw; break;
        case 1: value = raw + a; break;
        case 2: value = raw + b; break;
        case 3: value = raw + Math.floor((a + b) / 2); break;
        case 4: value = raw + paethPredictor(a, b, c); break;
        default: throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      row[x] = value & 0xff;
    }
    pixels.set(row, y * rowBytes);
    prevRow = row;
    readOffset += rowBytes;
  }

  return { width: ihdr.width, height: ihdr.height, channels, pixels };
}

/**
 * isFlatImage({ width, height, channels, pixels }, tolerance = 2) -> boolean
 * True if every pixel is within `tolerance` (per channel) of the first
 * pixel — catches a blank/solid-color capture (a failed render that still
 * produced a technically-valid PNG).
 */
export function isFlatImage(decoded, tolerance = 2) {
  const { channels, pixels } = decoded;
  if (pixels.length < channels) return true;
  const reference = pixels.subarray(0, channels);
  for (let i = channels; i < pixels.length; i += channels) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(pixels[i + c] - reference[c]) > tolerance) return false;
    }
  }
  return true;
}

/**
 * validateCapture({ pngBase64, width, height }) -> { ok: true, width, height, channels }
 *                                                 | { ok: false, error: "capture_unavailable", reason }
 * The single entry point server.mjs's capture endpoint (and canvas-capture.js
 * client-side, as a first line of defense) should call before ever
 * persisting a capture as a session artifact.
 */
export function validateCapture({ pngBase64, width, height } = {}) {
  if (typeof pngBase64 !== "string" || !pngBase64.trim()) {
    return { ok: false, error: "capture_unavailable", reason: "no image data supplied" };
  }

  let buffer;
  try {
    buffer = Buffer.from(pngBase64, "base64");
  } catch (_err) {
    return { ok: false, error: "capture_unavailable", reason: "image data is not valid base64" };
  }
  if (buffer.length === 0) {
    return { ok: false, error: "capture_unavailable", reason: "decoded image is empty" };
  }

  let decoded;
  try {
    decoded = decodePng(buffer);
  } catch (err) {
    return { ok: false, error: "capture_unavailable", reason: `invalid PNG: ${err.message}` };
  }

  if (decoded.width < 2 || decoded.height < 2) {
    return { ok: false, error: "capture_unavailable", reason: `image is too small (${decoded.width}x${decoded.height})` };
  }
  if (typeof width === "number" && width > 0 && decoded.width !== width) {
    return { ok: false, error: "capture_unavailable", reason: `declared width (${width}) does not match the PNG's actual width (${decoded.width})` };
  }
  if (typeof height === "number" && height > 0 && decoded.height !== height) {
    return { ok: false, error: "capture_unavailable", reason: `declared height (${height}) does not match the PNG's actual height (${decoded.height})` };
  }
  if (isFlatImage(decoded)) {
    return { ok: false, error: "capture_unavailable", reason: "image is a single flat color — capture likely failed silently" };
  }

  return { ok: true, width: decoded.width, height: decoded.height, channels: decoded.channels };
}
