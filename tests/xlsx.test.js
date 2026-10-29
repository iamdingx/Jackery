import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function readZip(bytes) {
  const entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28);
    entries.set(bytes.toString('utf8', offset + 30, offset + 30 + length), inflateRawSync(bytes.subarray(start, start + size)));
    offset = start + size;
  }
  return entries;
}

test('four-sheet workbook escapes text and preserves numeric and hyperlink types', async () => {
  const { buildWorkbook } = await import('../src/xlsx.js');
  const names = ['Work Summary', 'Functional Checks', 'Material Usage', 'Photo Index'];
  const workbook = buildWorkbook(names.map(name => ({ name,
    columns: [{ key: 'sn', label: 'SN <&> "', width: 28 }, { key: 'quantity', label: 'Quantity' }],
    rows: [{ sn: '=HYPERLINK("evil")<&>\u0000\r\n中文', quantity: 2.125 }, { sn: '+SUM(1,2)', quantity: null }],
    hyperlinks: name === 'Photo Index' ? [{ row: 1, column: 'sn', url: 'http://localhost:4310/api/photos/1?sn=A&B=2' }] : []
  })));
  const zip = readZip(workbook);
  assert.ok(zip.has('[Content_Types].xml'));
  assert.ok(zip.has('xl/worksheets/sheet4.xml'));
  const sheet = zip.get('xl/worksheets/sheet1.xml').toString();
  assert.match(sheet, /t="inlineStr"/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /&lt;&amp;&gt;/);
  assert.doesNotMatch(sheet, /\u0000/);
  assert.match(sheet, /<v>2.125<\/v>/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /autoFilter ref="A1:B3"/);
  assert.match(zip.get('xl/worksheets/_rels/sheet4.xml.rels').toString(), /TargetMode="External"/);
  assert.match(zip.get('xl/worksheets/_rels/sheet4.xml.rels').toString(), /A&amp;B=2/);
  mkdirSync('artifacts/helpers', { recursive: true });
  writeFileSync('artifacts/helpers/four-sheet.xlsx', workbook);
});

test('workbook rejects invalid sheet definitions and unsafe hyperlink schemes', async () => {
  const { buildWorkbook } = await import('../src/xlsx.js');
  const sheet = { name: 'Data', columns: [{ key: 'v', label: 'V' }], rows: [{ v: 'value' }] };
  assert.throws(() => buildWorkbook([sheet, sheet]), /sheet|duplicate/i);
  assert.throws(() => buildWorkbook([{ ...sheet, name: 'bad/name' }]), /sheet|name/i);
  assert.throws(() => buildWorkbook([{ ...sheet, rows: [{ v: Infinity }] }]), /finite|number/i);
  assert.throws(() => buildWorkbook([{ ...sheet, hyperlinks: [{ row: 2, column: 'v', url: 'https://example.com' }] }]), /row|link/i);
  assert.throws(() => buildWorkbook([{ ...sheet, hyperlinks: [{ row: 1, column: 'v', url: 'javascript:alert(1)' }] }]), /link|url/i);
});
