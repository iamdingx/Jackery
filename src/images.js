import { inflateSync } from 'node:zlib';
import { crc32 } from './zip.js';

function reject(code, message) { throw Object.assign(new Error(message), { code }); }
function invalid(message = 'Malformed or truncated image') { reject('IMAGE_INVALID', message); }
function dimensions(width, height, maxPixels) {
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || width * height > maxPixels) reject('IMAGE_DIMENSIONS', 'Invalid image dimensions or pixel limit exceeded');
}

function pngInfo(buffer, maxPixels) {
  let offset = 8, width, height, depth, color, interlace, ended = false, sawData = false, closedData = false, palette = false;
  const data = [];
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) invalid();
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) invalid();
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/u.test(type)) invalid('Invalid PNG chunk');
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== buffer.readUInt32BE(offset + 8 + length)) invalid('PNG checksum mismatch');
    if (offset === 8 && type !== 'IHDR') invalid('Missing PNG header');
    if (type === 'IHDR') {
      if (width !== undefined || length !== 13) invalid('Invalid PNG header');
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); depth = payload[8]; color = payload[9]; interlace = payload[12];
      dimensions(width, height, maxPixels);
      const allowed = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!allowed[color]?.includes(depth) || payload[10] !== 0 || payload[11] !== 0 || interlace > 1) invalid('Unsupported PNG header');
    } else if (type === 'PLTE') {
      if (palette || sawData || !length || length > 768 || length % 3 || color === 0 || color === 4 || (color === 3 && length / 3 > 2 ** depth)) invalid('Invalid PNG palette');
      palette = true;
    } else if (type === 'IDAT') {
      if (closedData || (color === 3 && !palette)) invalid('Invalid PNG data order');
      sawData = true; data.push(payload);
    } else {
      if (sawData) closedData = true;
      if (type === 'IEND') {
        if (length || !sawData || offset + 12 !== buffer.length) invalid('Invalid PNG ending');
        ended = true; break;
      }
      if (type[0] === type[0].toUpperCase()) invalid('Unknown critical PNG chunk');
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') invalid('Animated PNG is not supported');
    }
    offset += length + 12;
  }
  if (!ended) invalid('Missing PNG ending');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const scanlines = [];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    if (!w || !h) continue;
    const bytes = Math.ceil(w * channels * depth / 8) + 1;
    scanlines.push([h, bytes]); expected += h * bytes;
  }
  let raw;
  const compressed = Buffer.concat(data);
  try {
    const result = inflateSync(compressed, { maxOutputLength: expected + 1, info: true });
    if (result.engine.bytesWritten !== compressed.length) invalid('Unexpected bytes after PNG compressed data');
    raw = result.buffer;
  } catch { invalid('Corrupt PNG compressed data'); }
  if (raw.length !== expected) invalid('Truncated PNG pixel data');
  let start = 0;
  for (const [lines, bytes] of scanlines) for (let i = 0; i < lines; i++, start += bytes) if (raw[start] > 4) invalid('Invalid PNG scanline filter');
  return { mime: 'image/png', extension: 'png', width, height };
}

function jpegInfo(buffer, maxPixels) {
  let offset = 2, width, height, components, sawScan = false, entropy = false, sawPixels = false;
  let progressive = false;
  const frameComponents = new Map(), quantization = new Set(), huffman = new Set();
  while (offset < buffer.length) {
    if (entropy) {
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) { sawPixels = true; offset++; continue; }
        let markerOffset = offset + 1;
        while (buffer[markerOffset] === 0xff) markerOffset++;
        const marker = buffer[markerOffset];
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { sawPixels = true; offset = markerOffset + 1; continue; }
        entropy = false; break;
      }
    }
    if (buffer[offset] !== 0xff) invalid('Invalid JPEG marker');
    while (buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) invalid();
    const marker = buffer[offset++];
    if (marker === 0xd9) {
      if (!width || !sawScan || !sawPixels || offset !== buffer.length) invalid('Invalid JPEG ending');
      return { mime: 'image/jpeg', extension: 'jpg', width, height };
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) invalid('Unexpected JPEG marker');
    if (offset + 2 > buffer.length) invalid();
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) invalid();
    const payload = buffer.subarray(offset + 2, offset + length);
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (frame) {
      if (width !== undefined || ![0xc0, 0xc1, 0xc2].includes(marker) || payload.length < 6) invalid('Unsupported JPEG frame');
      height = payload.readUInt16BE(1); width = payload.readUInt16BE(3); components = payload[5];
      progressive = marker === 0xc2;
      dimensions(width, height, maxPixels);
      if (payload[0] !== 8 || ![1, 3, 4].includes(components) || payload.length !== 6 + 3 * components) invalid('Invalid JPEG frame');
      const ids = new Set();
      for (let i = 0; i < components; i++) {
        const id = payload[6 + i * 3], sampling = payload[7 + i * 3];
        if (ids.has(id) || !(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4 || payload[8 + i * 3] > 3) invalid('Invalid JPEG components');
        ids.add(id);
        frameComponents.set(id, payload[8 + i * 3]);
      }
    } else if (marker === 0xdb) {
      let cursor = 0;
      if (!payload.length) invalid('Empty JPEG quantization table');
      while (cursor < payload.length) {
        const table = payload[cursor++], precision = table >> 4, id = table & 15;
        const bytes = 64 * (precision + 1);
        if (precision > 1 || id > 3 || cursor + bytes > payload.length) invalid('Invalid JPEG quantization table');
        for (let i = 0; i < 64; i++) if ((precision ? payload.readUInt16BE(cursor + i * 2) : payload[cursor + i]) === 0) invalid('Zero JPEG quantization value');
        cursor += bytes; quantization.add(id);
      }
    } else if (marker === 0xc4) {
      let cursor = 0;
      if (!payload.length) invalid('Empty JPEG Huffman table');
      while (cursor < payload.length) {
        const table = payload[cursor++], kind = table >> 4, id = table & 15;
        if (kind > 1 || id > 3 || cursor + 16 > payload.length) invalid('Invalid JPEG Huffman table');
        let symbols = 0, slots = 1;
        for (let i = 0; i < 16; i++) {
          const count = payload[cursor++]; symbols += count; slots = slots * 2 - count;
          if (slots < 0) invalid('Oversubscribed JPEG Huffman table');
        }
        if (!symbols || symbols > 256 || cursor + symbols > payload.length) invalid('Invalid JPEG Huffman symbols');
        cursor += symbols; huffman.add(`${kind}:${id}`);
      }
    } else if (marker === 0xdd) {
      if (payload.length !== 2) invalid('Invalid JPEG restart interval');
    } else if (marker === 0xda) {
      const count = payload[0];
      if (!width || !count || count > components || payload.length !== 4 + 2 * count) invalid('Invalid JPEG scan header');
      const first = payload[payload.length - 3], last = payload[payload.length - 2], approximation = payload[payload.length - 1];
      if ((!progressive && (first !== 0 || last !== 63 || approximation !== 0)) || (progressive && (first > last || last > 63 || (first === 0 && last !== 0) || (first > 0 && count !== 1) || (approximation >> 4) > 13 || (approximation & 15) > 13))) invalid('Invalid JPEG spectral scan');
      const ids = new Set();
      for (let i = 0; i < count; i++) {
        const id = payload[1 + i * 2], tables = payload[2 + i * 2];
        if (ids.has(id) || !frameComponents.has(id) || !quantization.has(frameComponents.get(id)) || (tables >> 4) > 3 || (tables & 15) > 3) invalid('Invalid JPEG scan component');
        if ((!progressive || (first === 0 && (approximation >> 4) === 0)) && !huffman.has(`0:${tables >> 4}`)) invalid('Missing JPEG DC table');
        if ((!progressive || first > 0) && !huffman.has(`1:${tables & 15}`)) invalid('Missing JPEG AC table');
        ids.add(id);
      }
      sawScan = true; entropy = true;
    } else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      invalid('Unsupported JPEG marker');
    }
    offset += length;
  }
  invalid('Missing JPEG ending');
}

export function validateImage(buffer, { maxBytes = 8388608, maxPixels = 40000000 } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) invalid('Image must be a nonempty Buffer');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxPixels) || maxPixels <= 0) invalid('Invalid image limits');
  if (buffer.length > maxBytes) reject('IMAGE_TOO_LARGE', 'Image exceeds upload byte limit');
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return pngInfo(buffer, maxPixels);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return jpegInfo(buffer, maxPixels);
  reject('IMAGE_UNSUPPORTED', 'Only PNG and JPEG images are supported');
}
