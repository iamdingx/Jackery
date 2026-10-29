import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';

// Independent ZIP local-file reader: verifies consumer-visible bytes and names.
function readZip(bytes) {
  const result = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26);
    const extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString('utf8');
    const start = offset + 30 + length + extra;
    const packed = bytes.subarray(start, start + size);
    result.set(name, method === 8 ? inflateRawSync(packed) : packed);
    offset = start + size;
  }
  return result;
}

test('ZIP payloads and Unicode names survive a binary round trip', async () => {
  const { makeZip, crc32 } = await import('../src/zip.js');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const bytes = makeZip([{ name: '中文/a.txt', data: '<hello>&' }, { name: 'binary', data: Buffer.from([0, 255, 1]) }]);
  const entries = readZip(bytes);
  assert.equal(entries.get('中文/a.txt').toString(), '<hello>&');
  assert.deepEqual(entries.get('binary'), Buffer.from([0, 255, 1]));
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
});

test('ZIP refuses traversal, absolute, duplicate and ambiguous archive paths', async () => {
  const { makeZip } = await import('../src/zip.js');
  for (const name of ['../secret', '/root', 'a/../b', 'C:/a', 'a\\b', 'a//b', './a', 'a\0b', '']) {
    assert.throws(() => makeZip([{ name, data: '' }]), /name|path/i);
  }
  assert.throws(() => makeZip([{ name: 'a', data: '' }, { name: 'a', data: '' }]), /duplicate/i);
});

test('ZIP refuses paths normalized into traversal or device names on Windows', async () => {
  const { makeZip } = await import('../src/zip.js');
  for (const name of ['.. /secret', 'a/.../b', 'a./b', 'CON', 'nul.txt', 'x/LPT1.jpg', 'a/COM9', '\ud800']) {
    assert.throws(() => makeZip([{ name, data: '' }]), /name|path/i);
  }
});
