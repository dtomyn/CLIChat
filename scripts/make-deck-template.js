#!/usr/bin/env node
// Writes the sample program PowerPoint template for the change sample: samples/change/Templates/Training Deck
// Template.potx (used by the "Draft training materials" prompt). It shows what a program deck template looks like to
// Lumen: its own theme colours and fonts (teal and orange, Georgia headings, Segoe UI text), a brand band and "OPR"
// logo on the slide master, a footer, "Title Slide" / "Title and Content" / "Title Only" layouts, and one example
// slide with speaker notes that Lumen drops when it fills the template.
// Run:  node scripts/make-deck-template.js

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { basePackage, toPptx, CT } = require('../tools/pptx');

const OUT = path.join(__dirname, '..', 'samples', 'change', 'Templates');
const W = 12192000, H = 6858000;
const shape = (id, name, x, y, cx, cy, fill, text = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>`
  + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>`
  + `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>${text ? `<a:r><a:rPr lang="en-US" sz="1400" b="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:rPr><a:t>${text}</a:t></a:r>` : '<a:endParaRPr lang="en-US"/>'}</a:p></p:txBody></p:sp>`;

const BRAND = {
  name: 'Online Permit Renewal',
  colors: { dk1: '1F2A30', lt1: 'FFFFFF', dk2: '0F5C6E', lt2: 'DCEEF2', accent1: '0F5C6E', accent2: 'E07A1F', accent3: '5B8C3A', accent4: '8A5BA8', accent5: '2E75B6', accent6: '7F7F7F', hlink: '0F5C6E', folHlink: '8A5BA8' },
  major: 'Georgia', minor: 'Segoe UI',
  footer: 'Online Permit Renewal · Training · Protected A',
  masterShapes: shape(20, 'Brand band', 0, 0, W, 228600, 'accent1') + shape(21, 'Brand accent', 0, 228600, W, 45720, 'accent2') + shape(22, 'Logo', W - 1143000, 365760, 822960, 411480, 'accent1', 'OPR'),
  titleShapes: shape(23, 'Title band', 0, H - 914400, W, 914400, 'accent1'),
};

const EXAMPLE = `# Training deck title
Audience · date

## How to use this template
- One slide per topic, three to five bullets
- Speaker notes say what the trainer explains

Notes: Delete this example slide. Lumen drops it when it fills the template.
`;

(async () => {
  const when = '2026-11-01T00:00:00Z';
  const base = await basePackage(BRAND, { cx: W, cy: H, template: true, title: 'Training deck template', creator: 'Online Permit Renewal PMO', when }).generateAsync({ type: 'nodebuffer' });
  // Fill it once with an example slide (with notes), then mark it as a template again.
  const filled = await JSZip.loadAsync((await toPptx(EXAMPLE, { template: base })).buffer);
  const types = await filled.file('[Content_Types].xml').async('string');
  filled.file('[Content_Types].xml', types.replace(CT.presentation, CT.template));
  filled.file('docProps/core.xml', (await filled.file('docProps/core.xml').async('string'))
    .replace(/<dc:title>[\s\S]*?<\/dc:title>/, '<dc:title>Training deck template</dc:title>')
    .replace(/(<dcterms:(created|modified)[^>]*>)[^<]*/g, `$1${when}`));
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'Training Deck Template.potx');
  fs.writeFileSync(file, await filled.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.template' }));
  console.log(`Wrote ${file}`);
})();
