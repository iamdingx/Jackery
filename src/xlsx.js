import { makeZip } from './zip.js';

const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Strip characters forbidden by XML 1.0, including isolated UTF-16 surrogates.
function xml(value) {
  return String(value).replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;');
}
function columnName(index) {
  let result = '';
  for (index++; index; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result;
  return result;
}
function cell(value, reference, header = false) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cell number must be finite');
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  const text = value == null ? '' : String(value);
  if (text.length > 32767) throw new Error('Cell text exceeds Excel limit of 32767 characters');
  return `<c r="${reference}" t="inlineStr" s="${header ? 1 : 2}"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}

/** OOXML spreadsheet with inert inline text, a frozen header, filters and links. */
export function buildWorkbook(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 255) throw new Error('Invalid worksheet count');
  const entries = [], names = new Set();
  for (const [index, sheet] of sheets.entries()) {
    if (!sheet || typeof sheet.name !== 'string' || !sheet.name || sheet.name.length > 31 || /[\\/?*\[\]:\x00-\x1f]/u.test(sheet.name) || /^'|'$/u.test(sheet.name)) throw new Error('Invalid worksheet name');
    const key = sheet.name.toLocaleLowerCase('en-US');
    if (names.has(key)) throw new Error('Duplicate worksheet name');
    names.add(key);
    if (!Array.isArray(sheet.columns) || !sheet.columns.length || sheet.columns.length > 16384 || !Array.isArray(sheet.rows) || sheet.rows.length > 1048575) throw new Error('Worksheet exceeds row/column limits or has invalid rows/columns');
    const keys = new Set();
    for (const col of sheet.columns) {
      if (typeof col.key !== 'string' || !col.key || keys.has(col.key)) throw new Error('Invalid or duplicate column key');
      keys.add(col.key);
      if (col.width != null && (!Number.isFinite(col.width) || col.width <= 0 || col.width > 255)) throw new Error('Invalid column width');
    }
    const rows = [`<row r="1" ht="30" customHeight="1">${sheet.columns.map((col, c) => cell(col.label ?? col.key, `${columnName(c)}1`, true)).join('')}</row>`];
    sheet.rows.forEach((row, r) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid worksheet row');
      rows.push(`<row r="${r + 2}">${sheet.columns.map((col, c) => cell(row[col.key], `${columnName(c)}${r + 2}`)).join('')}</row>`);
    });
    const links = [], relations = [], references = new Set();
    if (sheet.hyperlinks != null && !Array.isArray(sheet.hyperlinks)) throw new Error('Invalid hyperlink collection');
    for (const link of sheet.hyperlinks ?? []) {
      if (!link || !Number.isInteger(link.row) || link.row < 1 || link.row > sheet.rows.length || !keys.has(link.column)) throw new Error('Invalid hyperlink row/column');
      if (typeof link.url !== 'string' || /[\x00-\x20\x7f\\]/u.test(link.url) || !(/^(https?:\/\/)/iu.test(link.url) || /^\/(?!\/)/u.test(link.url))) throw new Error('Invalid hyperlink URL');
      if (/^https?:/iu.test(link.url)) { try { new URL(link.url); } catch { throw new Error('Invalid hyperlink URL'); } }
      const reference = `${columnName(sheet.columns.findIndex(col => col.key === link.column))}${link.row + 1}`;
      if (references.has(reference)) throw new Error('Duplicate hyperlink cell');
      references.add(reference);
      const id = `rId${links.length + 1}`;
      links.push(`<hyperlink ref="${reference}" r:id="${id}"/>`);
      relations.push(`<Relationship Id="${id}" Type="${rel}/hyperlink" Target="${xml(link.url)}" TargetMode="External"/>`);
    }
    const end = `${columnName(sheet.columns.length - 1)}${sheet.rows.length + 1}`;
    const widths = sheet.columns.map((col, c) => `<col min="${c + 1}" max="${c + 1}" width="${col.width ?? 22}" customWidth="1"/>`).join('');
    entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: declaration + `<worksheet xmlns="${main}" xmlns:r="${rel}"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${end}"/>${links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''}</worksheet>` });
    if (relations.length) entries.push({ name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`, data: declaration + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}</Relationships>` });
  }
  entries.push({ name: '[Content_Types].xml', data: declaration + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  entries.push({ name: '_rels/.rels', data: declaration + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  entries.push({ name: 'xl/workbook.xml', data: declaration + `<workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  entries.push({ name: 'xl/_rels/workbook.xml.rels', data: declaration + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>` });
  entries.push({ name: 'xl/styles.xml', data: declaration + `<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183B56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
  return makeZip(entries);
}
