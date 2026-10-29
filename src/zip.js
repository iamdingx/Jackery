import { deflateRawSync } from 'node:zlib';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

export function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** A bounded classic ZIP writer; names are relative POSIX file paths. */
export function makeZip(entries) {
  if (!Array.isArray(entries) || entries.length > 65535) throw new Error('Invalid ZIP entry count');
  const names = new Set();
  const locals = [], central = [];
  let offset = 0, centralSize = 0;
  for (const entry of entries) {
    const name = entry?.name;
    if (typeof name !== 'string' || !name.isWellFormed() || /[\\:\x00-\x1f\x7f]/u.test(name) || name.split('/').some(part => !part || /[. ]$/u.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part))) {
      throw new Error('Invalid ZIP entry path/name');
    }
    if (names.has(name)) throw new Error('Duplicate ZIP entry name');
    names.add(name);
    const filename = Buffer.from(name, 'utf8');
    if (filename.length > 65535) throw new Error('ZIP entry name too long');
    if (!Buffer.isBuffer(entry.data) && typeof entry.data !== 'string') throw new Error('ZIP data must be Buffer or string');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const packed = deflateRawSync(data);
    if (data.length > 0xffffffff || packed.length > 0xffffffff || offset > 0xffffffff) throw new Error('ZIP64 is not supported');
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); // 1980-01-01, reproducible archives
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    locals.push(header, filename, packed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    centralSize += directory.length + filename.length;
    offset += header.length + filename.length + packed.length;
  }
  if (offset + centralSize > 0xffffffff) throw new Error('ZIP64 is not supported');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
