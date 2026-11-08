#!/usr/bin/env node
// Writes the sample program Word templates for the AIDLC sample: samples/aidlc/Templates/FDD Template.dotx and
// TDD Template.dotx. They show what a program template looks like to Lumen: its own styles (found by name), a cover
// page with a "title" content control and {{version}} / {{date}} / {{approver}} placeholders, a header and footer,
// and a {{content}} paragraph where the document body goes.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const OUT = path.join(__dirname, '..', 'samples', 'aidlc', 'Templates');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ACCENT = '0F5C6E', SOFT = 'DCEEF2';

function styles() {
  const para = (id, name, { basedOn = 'Normal', next, pPr = '', rPr = '', outline } = {}) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>`
    + `${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ''}${next ? `<w:next w:val="${next}"/>` : ''}<w:qFormat/>`
    + `<w:pPr>${pPr}${outline !== undefined ? `<w:outlineLvl w:val="${outline}"/>` : ''}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  const heading = (n, size, extra = '') => para(`Heading${n}`, `heading ${n}`, { next: 'Normal', outline: n - 1,
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 480 : 280}" w:after="120"/>${n === 1 ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${ACCENT}"/></w:pBdr>` : ''}`,
    rPr: `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${ACCENT}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${extra}` });
  return `${XML}<w:styles ${NS}>`
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:eastAsia="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-CA"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    + '<w:style w:type="character" w:styleId="PlaceholderText"><w:name w:val="Placeholder Text"/><w:semiHidden/><w:rPr><w:color w:val="808080"/></w:rPr></w:style>'
    + para('Title', 'Title', { next: 'Normal', pPr: '<w:spacing w:before="2400" w:after="240"/>', rPr: `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:color w:val="${ACCENT}"/><w:sz w:val="60"/><w:szCs w:val="60"/>` })
    + para('Subtitle', 'Subtitle', { next: 'Normal', pPr: '<w:spacing w:after="720"/>', rPr: '<w:color w:val="595959"/><w:sz w:val="30"/><w:szCs w:val="30"/>' })
    + heading(1, 34) + heading(2, 28) + heading(3, 24) + heading(4, 22, '<w:i/>')
    + para('ListParagraph', 'List Paragraph', { pPr: '<w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/>' })
    + para('ListBullet', 'List Bullet', { pPr: '<w:spacing w:after="60"/><w:ind w:left="720" w:hanging="360"/><w:contextualSpacing/>' })
    + para('ListNumber', 'List Number', { pPr: '<w:spacing w:after="60"/><w:ind w:left="720" w:hanging="360"/><w:contextualSpacing/>' })
    + para('Quote', 'Quote', { next: 'Normal', pPr: `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${ACCENT}"/></w:pBdr><w:ind w:left="432" w:right="432"/>`, rPr: '<w:i/><w:color w:val="404040"/>' })
    + para('Caption', 'caption', { next: 'Normal', rPr: `<w:i/><w:color w:val="${ACCENT}"/><w:sz w:val="18"/>` })
    + para('Code', 'Code', { pPr: `<w:shd w:val="clear" w:color="auto" w:fill="F3F6F7"/><w:spacing w:after="140" w:line="240" w:lineRule="auto"/>`, rPr: '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/>' })
    + para('Header', 'header', { pPr: '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:after="0"/>', rPr: '<w:color w:val="7F7F7F"/><w:sz w:val="17"/>' })
    + para('Footer', 'footer', { pPr: '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:after="0"/>', rPr: '<w:color w:val="7F7F7F"/><w:sz w:val="17"/>' })
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${ACCENT}"/>`).join('')
    + '</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
}

const p = (text, style, extra = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${text ? `<w:r>${extra}<w:t xml:space="preserve">${x(text)}</w:t></w:r>` : ''}</w:p>`;

function documentXml(kind) {
  const row = (label, value) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${SOFT}"/></w:tcPr>${p(label, null, '<w:rPr><w:b/></w:rPr>')}</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="6960" w:type="dxa"/></w:tcPr>${p(value)}</w:tc></w:tr>`;
  const titleControl = '<w:sdt><w:sdtPr><w:alias w:val="Title"/><w:tag w:val="title"/><w:showingPlcHdr/></w:sdtPr><w:sdtContent>'
    + '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr><w:t>Document title</w:t></w:r></w:p></w:sdtContent></w:sdt>';
  return `${XML}<w:document ${NS}><w:body>`
    + titleControl
    + p(kind, 'Subtitle')
    + `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9360" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="6960"/></w:tblGrid>`
    + row('Program', 'Online Permit Renewal') + row('Version', '{{version}}') + row('Date', '{{date}}') + row('Approved by', '{{approver}}') + row('Classification', 'Protected A')
    + '</w:tbl>'
    + p('')
    + p(`This ${kind.toLowerCase()} follows the program Ways of Working. Changes after approval go through change control.`, null, '<w:rPr><w:i/><w:color w:val="595959"/></w:rPr>')
    + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    + p('{{content}}')
    + '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/>'
    + '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:titlePg/></w:sectPr>'
    + '</w:body></w:document>';
}

const header = (kind) => `${XML}<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t xml:space="preserve">{{title}}</w:t></w:r><w:r><w:tab/><w:t>${x(kind)}</w:t></w:r></w:p></w:hdr>`;
const footer = () => `${XML}<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">Version {{version}} · Approved by {{approver}}</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">Page </w:t></w:r>`
  + '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';

async function make(file, kind) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/>`
    + `<Relationship Id="rIdHeader1" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`);
  zip.file('word/document.xml', documentXml(kind));
  zip.file('word/styles.xml', styles());
  zip.file('word/settings.xml', `${XML}<w:settings ${NS}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
  zip.file('word/header1.xml', header(kind));
  zip.file('word/footer1.xml', footer());
  zip.file('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${x(kind)} template</dc:title><dc:creator>Online Permit Renewal PMO</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-11-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-11-01T00:00:00Z</dcterms:modified></cp:coreProperties>`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(`Wrote ${path.join(OUT, file)}`);
}

(async () => {
  await make('FDD Template.dotx', 'Functional Design Document');
  await make('TDD Template.dotx', 'Technical Design Document');
})();
