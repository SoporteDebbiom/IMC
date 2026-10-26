/* MiniXLSX · exportador .xlsx propio, sin dependencias externas.
   La app solo EXPORTA una hoja plana, así que no necesitamos SheetJS (que
   arrastraba CVEs). Genera un .xlsx válido (ZIP "store" + XML mínimo).
   Las celdas de texto usan inlineStr → NUNCA se interpretan como fórmula,
   por lo que no hay inyección de fórmulas (CSV/formula injection). */
const MiniXLSX = (() => {
  const _crcTab = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function _crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = _crcTab[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function _col(i) { i++; let s = ''; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26 | 0; } return s; }
  function _esc(v) {
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function _celda(ref, v) {
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
    const s = (v === null || v === undefined) ? '' : String(v);
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + _esc(s) + '</t></is></c>';
  }
  function _fila(nFila, celdas) {
    let xml = '<row r="' + nFila + '">';
    for (let c = 0; c < celdas.length; c++) xml += _celda(_col(c) + nFila, celdas[c]);
    return xml + '</row>';
  }
  function _colsXML(anchos) {
    if (!anchos || !anchos.length) return '';
    let x = '<cols>';
    for (let i = 0; i < anchos.length; i++) x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Number(anchos[i] || 12) + '" customWidth="1"/>';
    return x + '</cols>';
  }
  function _sheetXML(encabezados, filas, anchos) {
    let body = '';
    let n = 1;
    if (encabezados && encabezados.length) body += _fila(n++, encabezados);
    (filas || []).forEach(f => { body += _fila(n++, f); });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      _colsXML(anchos) + '<sheetData>' + body + '</sheetData></worksheet>';
  }
  function _nombreHoja(s) {
    let n = String(s || 'Hoja1').replace(/[\[\]\*\?\/\\:]/g, ' ').trim().slice(0, 31);
    return n || 'Hoja1';
  }
  function _workbookXML(nombreHoja) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + _esc(_nombreHoja(nombreHoja)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  }
  const _CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const _RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const _WB_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';

  function _zip(files) {
    const chunks = [], central = [];
    let offset = 0;
    const u16 = n => [n & 0xFF, (n >> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF];
    for (const f of files) {
      const crc = _crc32(f.data), len = f.data.length, nl = f.name.length;
      const lh = [0x50, 0x4b, 0x03, 0x04].concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(len), u32(len), u16(nl), u16(0));
      chunks.push(new Uint8Array(lh), f.name, f.data);
      const cd = [0x50, 0x4b, 0x01, 0x02].concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(len), u32(len), u16(nl), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(cd), f.name);
      offset += lh.length + nl + len;
    }
    let cdSize = 0; central.forEach(c => cdSize += c.length);
    const eocd = new Uint8Array([0x50, 0x4b, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    const all = chunks.concat(central, [eocd]);
    let total = 0; all.forEach(a => total += a.length);
    const out = new Uint8Array(total); let p = 0;
    all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  // Devuelve los bytes del .xlsx (Uint8Array). Puro: testeable sin navegador.
  function construir(nombreHoja, encabezados, filas, anchos) {
    const enc = new TextEncoder();
    const B = s => enc.encode(s);
    const files = [
      { name: B('[Content_Types].xml'), data: B(_CONTENT_TYPES) },
      { name: B('_rels/.rels'), data: B(_RELS) },
      { name: B('xl/workbook.xml'), data: B(_workbookXML(nombreHoja)) },
      { name: B('xl/_rels/workbook.xml.rels'), data: B(_WB_RELS) },
      { name: B('xl/worksheets/sheet1.xml'), data: B(_sheetXML(encabezados, filas, anchos)) }
    ];
    return _zip(files);
  }

  // Construye y descarga el archivo en el navegador.
  function descargar(nombreArchivo, nombreHoja, encabezados, filas, anchos) {
    const bytes = construir(nombreHoja, encabezados, filas, anchos);
    const seguro = (typeof Seguridad !== 'undefined' && Seguridad.nombreArchivoSeguro) ? Seguridad.nombreArchivoSeguro(nombreArchivo, 'datos.xlsx') : nombreArchivo;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = seguro;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { construir, descargar };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MiniXLSX;
