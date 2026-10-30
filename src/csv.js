function fail(code, message, details) {
  throw Object.assign(new Error(message), { code, details });
}

/** Strict RFC4180-style CSV. Diagnostic rows use physical starting line numbers. */
export function parseBomCsv(csv) {
  if (typeof csv !== 'string') fail('CSV_INVALID', 'CSV must be text', [{ row: 1, message: 'Expected text' }]);
  csv = csv.replace(/^\ufeff/u, '');
  const records = [];
  let fields = [], value = '', state = 'start', line = 1, startLine = 1;
  function emitField() { fields.push(value); value = ''; state = 'start'; }
  function emitRecord() {
    emitField();
    // Empty physical lines are ignored; delimiter-only rows remain errors.
    if (!(fields.length === 1 && fields[0] === '')) records.push({ fields, row: startLine });
    fields = [];
    if (records.length > 5001) fail('CSV_TOO_MANY_ROWS', 'CSV supports at most 5000 data rows', [{ row: startLine, message: 'Row limit exceeded' }]);
  }
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (csv[i + 1] === '"') { value += '"'; i++; } else state = 'closed';
      } else {
        value += char;
        if (char === '\n' || (char === '\r' && csv[i + 1] !== '\n')) line++;
      }
      continue;
    }
    if (char === ',') { emitField(); continue; }
    if (char === '\r' || char === '\n') {
      emitRecord();
      if (char === '\r' && csv[i + 1] === '\n') i++;
      line++; startLine = line; continue;
    }
    if (char === '"') {
      if (state !== 'start') fail('CSV_INVALID', 'Unexpected quote in CSV', [{ row: line, message: 'Quote must start a field' }]);
      state = 'quoted'; continue;
    }
    if (state === 'closed') fail('CSV_INVALID', 'Unexpected text after closing quote', [{ row: line, message: 'Expected delimiter after quoted field' }]);
    value += char; state = 'plain';
  }
  if (state === 'quoted') fail('CSV_INVALID', 'Unterminated CSV quoted field', [{ row: startLine, message: 'Unterminated quoted field' }]);
  if (value !== '' || fields.length || state === 'closed') emitRecord();
  const expected = ['sku', 'descriptionEn', 'descriptionZh', 'unit'];
  const header = records.shift();
  const withQuantity=header?.fields.length===5;
  if(withQuantity)expected.push('standardQty');
  if (!header || header.fields.length !== expected.length || header.fields.some((field, index) => field !== expected[index])) {
    fail('CSV_INVALID_HEADERS', 'Expected headers: sku,descriptionEn,descriptionZh,unit[,standardQty]', [{ row: header?.row ?? 1, message: 'Invalid or duplicate headers' }]);
  }
  const details = [], rows = [], skus = new Map();
  for (const record of records) {
    if (record.fields.length !== expected.length) { details.push({ row: record.row, message: `Expected ${expected.length} fields` }); continue; }
    const row = Object.fromEntries(expected.map((key, index) => [key, record.fields[index].trim()]));
    // Retain provenance for backend model/existing-SKU checks without changing DTO keys.
    Object.defineProperty(row, 'sourceRow', { value: record.row, enumerable: false });
    for (const key of ['sku', 'descriptionEn', 'unit']) {
      if (!row[key]) details.push({ row: record.row, field: key, message: `${key} is required` });
    }
    if (Object.values(row).some(text => /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text))) details.push({ row: record.row, message: 'Invalid control character' });
    if(withQuantity){const value=Number(row.standardQty);if(!row.standardQty||!Number.isFinite(value)||value<=0||value>1000000)details.push({row:record.row,field:'standardQty',message:'A positive standard quantity is required'});row.standardQty=value;}
    if (skus.has(row.sku)) details.push({ row: record.row, field: 'sku', message: `Duplicate SKU (first at row ${skus.get(row.sku)})` });
    else skus.set(row.sku, record.row);
    rows.push(row);
  }
  if (details.length) fail('CSV_INVALID_ROWS', 'CSV validation failed; no rows imported', details);
  return rows;
}
