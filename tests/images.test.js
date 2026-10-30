import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z', 'base64');

test('PNG and JPEG signatures return actual dimensions and canonical media types', async () => {
  const { validateImage } = await import('../src/images.js');
  assert.deepEqual(validateImage(png), { mime: 'image/png', extension: 'png', width: 2, height: 3 });
  assert.deepEqual(validateImage(jpeg), { mime: 'image/jpeg', extension: 'jpg', width: 2, height: 3 });
  assert.doesNotThrow(() => validateImage(png, { maxBytes: png.length, maxPixels: 6 }));
});

test('image validation rejects truncated, corrupt, unsupported and excessive images with codes', async () => {
  const { validateImage } = await import('../src/images.js');
  const corrupt = Buffer.from(png); corrupt[45] ^= 1;
  for (const bytes of [png.subarray(0, 24), png.subarray(0, -1), jpeg.subarray(0, -2), corrupt,
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('RIFF1234WEBP'), Buffer.from([0xff, 0xd8, 0xff, 0xd9])]) {
    assert.throws(() => validateImage(bytes), error => typeof error.code === 'string');
  }
  assert.throws(() => validateImage(png, { maxBytes: png.length - 1 }), error => error.code === 'IMAGE_TOO_LARGE');
  assert.throws(() => validateImage(png, { maxPixels: 5 }), error => error.code === 'IMAGE_DIMENSIONS');
});

test('every proper prefix is rejected rather than accepted from dimensions alone', async () => {
  const { validateImage } = await import('../src/images.js');
  for (const image of [png, jpeg]) for (let length = 1; length < image.length; length++) {
    assert.throws(() => validateImage(image.subarray(0, length)), error => typeof error.code === 'string', `prefix length ${length}`);
  }
});

test('complete JPEG codestream remains a valid photo when source data follows its end marker', async () => {
  const { validateImage } = await import('../src/images.js');
  for (const tail of [Buffer.alloc(24),Buffer.from('Camera source metadata'),Buffer.from([0,0,0,24,102,116,121,112,109,112,52,50])]) {
    const original=Buffer.concat([jpeg,tail]);
    assert.deepEqual(validateImage(original),{mime:'image/jpeg',extension:'jpg',width:2,height:3});
    assert.deepEqual(original.subarray(jpeg.length),tail,'Validation does not rewrite original evidence');
    assert.throws(()=>validateImage(original,{maxBytes:original.length-1}),error=>error.code==='IMAGE_TOO_LARGE','All source bytes count toward the upload size');
  }
});

test('JPEG end markers inside metadata do not hide corrupt or truncated actual image data', async () => {
  const { validateImage } = await import('../src/images.js');
  const comment=Buffer.from([255,254,0,6,255,217,0,0]);
  const withComment=Buffer.concat([jpeg.subarray(0,2),comment,jpeg.subarray(2)]);
  assert.deepEqual(validateImage(withComment),{mime:'image/jpeg',extension:'jpg',width:2,height:3});
  assert.throws(()=>validateImage(withComment.subarray(0,-2)),error=>error.code==='IMAGE_INVALID');
  assert.throws(()=>validateImage(Buffer.from([255,216,255,217,0,0])),error=>error.code==='IMAGE_INVALID');
});

test('JPEG frame dimensions and segment lengths are checked before acceptance', async () => {
  const { validateImage } = await import('../src/images.js');
  const zero = Buffer.from(jpeg), frame = zero.indexOf(Buffer.from([0xff, 0xc0]));
  zero.writeUInt16BE(0, frame + 5);
  assert.throws(() => validateImage(zero), error => error.code === 'IMAGE_DIMENSIONS');
  const broken = Buffer.from(jpeg); broken.writeUInt16BE(65535, 4);
  assert.throws(() => validateImage(broken), error => error.code === 'IMAGE_INVALID');
  // Trailer bytes do not invalidate a complete JPEG codestream. The attachment
  // endpoint's image MIME, nosniff and access controls are verified in-browser.
  assert.deepEqual(validateImage(Buffer.concat([jpeg, Buffer.from('<script>')])),{mime:'image/jpeg',extension:'jpg',width:2,height:3});
});

test('JPEG requires valid quantization and Huffman tables and matching scan components', async () => {
  const { validateImage } = await import('../src/images.js');
  const noTables = Buffer.from(jpeg), table = noTables.indexOf(Buffer.from([0xff, 0xdb]));
  noTables[table + 4] = 0xff;
  const badHuffman = Buffer.from(jpeg), huffman = badHuffman.indexOf(Buffer.from([0xff, 0xc4]));
  badHuffman[huffman + 4] = 0x44;
  const badScan = Buffer.from(jpeg), scan = badScan.indexOf(Buffer.from([0xff, 0xda]));
  badScan[scan + 5] = 99;
  for (const bytes of [noTables, badHuffman, badScan]) assert.throws(() => validateImage(bytes), error => error.code === 'IMAGE_INVALID');
});

test('PNG rejects non-ASCII chunk names and extra bytes concealed in compressed data', async () => {
  const { validateImage } = await import('../src/images.js');
  const chunk = (type, payload) => {
    const data = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
    const header = Buffer.alloc(4), checksum = Buffer.alloc(4);
    header.writeUInt32BE(payload.length); checksum.writeUInt32BE(crc32(data));
    return Buffer.concat([header, data, checksum]);
  };
  const badName = Buffer.from(png); badName[12] = 0xc9;
  badName.writeUInt32BE(crc32(badName.subarray(12, 29)), 29);
  const idat = png.indexOf(Buffer.from('IDAT')), length = png.readUInt32BE(idat - 4);
  const extraData = Buffer.concat([png.subarray(0, idat - 4), chunk('IDAT', Buffer.concat([png.subarray(idat + 4, idat + 4 + length), Buffer.from('hidden')])), png.subarray(idat + length + 8)]);
  for (const image of [badName, extraData]) assert.throws(() => validateImage(image), error => error.code === 'IMAGE_INVALID');
});
