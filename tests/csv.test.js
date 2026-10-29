import test from 'node:test';
import assert from 'node:assert/strict';

test('BOM CSV parses UTF8 BOM, quoted commas, escaped quotes and multiline CRLF', async () => {
  const { parseBomCsv } = await import('../src/csv.js');
  assert.deepEqual(parseBomCsv('\ufeffsku,descriptionEn,descriptionZh,unit\r\n A-1 ,"Packing, \"\"Box\"\"\r\nLarge",包装,pcs\r\n'), [
    { sku: 'A-1', descriptionEn: 'Packing, "Box"\r\nLarge', descriptionZh: '包装', unit: 'pcs' }
  ]);
});

test('CSV reports malformed headers, quoting, row width and incomplete or duplicate SKU rows', async () => {
  const { parseBomCsv } = await import('../src/csv.js');
  for (const csv of ['sku,sku,descriptionZh,unit\na,b,c,d', 'sku,descriptionEn,descriptionZh\na,b,c',
    'sku,descriptionEn,descriptionZh,unit\na,"unterminated',
    'sku,descriptionEn,descriptionZh,unit\na,"bad"x,c,d',
    'sku,descriptionEn,descriptionZh,unit\na,b,c,d,e',
    'sku,descriptionEn,descriptionZh,unit\n,b,c,d',
    'sku,descriptionEn,descriptionZh,unit\na,,c,d',
    'sku,descriptionEn,descriptionZh,unit\na,b,c,',
    'sku,descriptionEn,descriptionZh,unit\na,b,c,d\na,e,f,d']) {
    assert.throws(() => parseBomCsv(csv), error => typeof error.code === 'string' && Array.isArray(error.details) && error.details[0].row >= 1);
  }
});

test('CSV preserves exactly 5000 rows but rejects excess rows atomically', async () => {
  const { parseBomCsv } = await import('../src/csv.js');
  const csv = 'sku,descriptionEn,descriptionZh,unit\n' + Array.from({ length: 5000 }, (_, i) => `SKU-${i},Part,,pcs`).join('\n');
  assert.equal(parseBomCsv(csv).length, 5000);
  assert.throws(() => parseBomCsv(csv + '\nEXCESS,Part,,pcs'), error => error.code === 'CSV_TOO_MANY_ROWS');
});

test('CSV keeps physical source lines as nonenumerable metadata for later transactional errors', async () => {
  const { parseBomCsv } = await import('../src/csv.js');
  const rows = parseBomCsv('sku,descriptionEn,descriptionZh,unit\r\nA,"first\r\nsecond",,pcs\r\n\r\nB,Next,,pcs\r\n');
  assert.equal(rows[0].sourceRow, 2);
  assert.equal(rows[1].sourceRow, 5);
  assert.deepEqual(Object.keys(rows[1]), ['sku', 'descriptionEn', 'descriptionZh', 'unit']);
  assert.equal(JSON.stringify(rows[1]), '{"sku":"B","descriptionEn":"Next","descriptionZh":"","unit":"pcs"}');
});
