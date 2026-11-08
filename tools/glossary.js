// Bilingual QA: compare an English document with its French version against an EN/FR terminology sheet.
// Read-only. Finds:
//   - terminology: a glossary term in the English paragraph whose approved French term is missing from the French one
//   - untranslated: English left in the French text (a glossary term, or several English function words)
//   - numbers: numbers, dates, amounts or IDs that differ between the two versions
//   - missing: paragraphs with no counterpart (paragraphs are aligned on shared numbers, IDs, glossary terms and length)
// It is a machine check. A translator still reviews every French draft.

const fs = require('fs');
const path = require('path');
const excel = require('./excel');
const docx = require('./docx');

const cellText = excel.cellText;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const excerpt = (s, n = 200) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// ------------------------------------------------------------------ glossary
async function readGlossary(file) {
  const wb = await excel.open(file);
  for (const ws of wb.worksheets) {
    const headers = [];
    ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
    const col = (re) => headers.findIndex((h) => h && re.test(h));
    const en = col(/english|anglais|^en\b|\(en\)/i), fr = col(/french|fran[cç]ais|^fr\b|\(fr\)/i);
    if (en < 1 || fr < 1) continue;
    const keep = col(/do not translate|ne pas traduire|keep/i), notes = col(/note|comment|context/i);
    const terms = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const e = cellText(row.getCell(en)).trim();
      const f = cellText(row.getCell(fr)).trim();
      if (!e) return;
      const k = keep > 0 && /^(y|yes|oui|x|true)/i.test(cellText(row.getCell(keep)).trim());
      terms.push({ en: e, fr: (f ? f.split(/\s*[;|]\s*|\s+\/\s+/) : []).filter(Boolean), keep: k || (!!f && fold(f) === fold(e)), notes: notes > 0 ? cellText(row.getCell(notes)).trim() : '', at: `${ws.name}!A${r}` });
    });
    return terms.sort((a, b) => b.en.length - a.en.length); // longest first, so "renewal application" wins over "renewal"
  }
  throw friendly(`"${path.basename(file)}" needs a sheet with an English column and a French column (for example "English" and "Français").`);
}

// ------------------------------------------------------------------ documents
function readText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.docx' || ext === '.docm') return docx.docxToText(file);
  if (['.md', '.markdown', '.txt'].includes(ext)) return fs.readFileSync(file, 'utf8');
  throw friendly(`"${path.basename(file)}" must be a Word document (.docx) or a text file (.md, .txt).`);
}
const paragraphs = (text) => String(text).replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/^#+\s*/, '').replace(/^>\s*/gm, '').trim()).filter((p) => p && !/^[-|: ]+$/.test(p));

const termRe = (t) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(fold(t))}(s|es)?(?=$|[^\\p{L}\\p{N}])`, 'u');

// ------------------------------------------------------------------ numbers, dates and IDs
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).join('|');
const pad = (n) => String(n).padStart(2, '0');

/** Numbers, dates and IDs in a paragraph, normalised so "$1,250.50" (EN) and "1 250,50 $" (FR) compare equal. */
function anchors(text, lang) {
  const out = [];
  let t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[  ]/g, ' ');
  // IDs keep their capitals (BR-002, IMM 5444), so ordinary words before a number ("in 2027") are not IDs.
  t = t.replace(/\b([A-Z]{2,6})[- ]?(\d{3,})\b/g, (_, p, n) => { out.push(`id:${p}-${n}`); return ' '; }).toLowerCase();
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => { out.push(`date:${y}-${m}-${d}`); return ' '; });
  t = t.replace(new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_RE})\\s+(\\d{4})\\b`, 'g'), (_, d, m, y) => { out.push(`date:${y}-${pad(MONTHS[m])}-${pad(d)}`); return ' '; });
  t = t.replace(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'g'), (_, m, d, y) => { out.push(`date:${y}-${pad(MONTHS[m])}-${pad(d)}`); return ' '; });
  const num = lang === 'fr' ? /\d{1,3}(?: \d{3})+(?:,\d+)?|\d+(?:,\d+)?/g : /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  for (const m of t.match(num) || []) {
    const v = lang === 'fr' ? m.replace(/ /g, '').replace(',', '.') : m.replace(/,/g, '');
    out.push(`n:${+v}`);
  }
  return out;
}
const show = (a) => a.replace(/^(n|date|id):/, '');

function multisetDiff(a, b) {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const A = count(a), B = count(b);
  const onlyA = [], onlyB = [];
  for (const [k, n] of A) for (let i = 0; i < n - (B.get(k) || 0); i++) onlyA.push(k);
  for (const [k, n] of B) for (let i = 0; i < n - (A.get(k) || 0); i++) onlyB.push(k);
  return { onlyA, onlyB };
}

// ------------------------------------------------------------------ alignment
function features(en, fr, glossary) {
  const E = en.map((p) => ({ text: p, f: fold(p), anchors: anchors(p, 'en') }));
  const F = fr.map((p) => ({ text: p, f: fold(p), anchors: anchors(p, 'fr') }));
  for (const [i, t] of glossary.entries()) {
    const re = termRe(t.en), frRes = (t.keep ? [t.en] : t.fr).map(termRe);
    for (const e of E) if (re.test(e.f)) e.anchors.push(`g:${i}`);
    for (const f of F) if (frRes.some((r) => r.test(f.f))) f.anchors.push(`g:${i}`);
  }
  return { E, F };
}

function pairScore(e, f) {
  const A = new Set(e.anchors), B = new Set(f.anchors);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  const anchorSim = union ? inter / union : 0.5;
  const le = e.text.length * 1.15, lf = f.text.length; // French runs about 15% longer
  const lenSim = Math.min(le, lf) / Math.max(le, lf, 1);
  return 0.65 * anchorSim + 0.35 * lenSim;
}

/** Align paragraphs (Needleman–Wunsch on pairScore). Returns [[i|null, j|null]]. */
function align(E, F, gap = -0.15) {
  const n = E.length, m = F.length;
  const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { S[i][0] = i * gap; B[i][0] = 1; }
  for (let j = 1; j <= m; j++) { S[0][j] = j * gap; B[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = S[i - 1][j - 1] + pairScore(E[i - 1], F[j - 1]), u = S[i - 1][j] + gap, l = S[i][j - 1] + gap;
      if (d >= u && d >= l) { S[i][j] = d; B[i][j] = 0; } else if (u >= l) { S[i][j] = u; B[i][j] = 1; } else { S[i][j] = l; B[i][j] = 2; }
    }
  }
  const out = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const b = i && j ? B[i][j] : i ? 1 : 2;
    if (b === 0) { out.push([i - 1, j - 1]); i--; j--; } else if (b === 1) { out.push([i - 1, null]); i--; } else { out.push([null, j - 1]); j--; }
  }
  return out.reverse();
}

// ------------------------------------------------------------------ check
const ENGLISH_WORDS = ['the', 'and', 'with', 'your', 'you', 'will', 'must', 'please', 'should', 'which', 'this', 'that', 'from', 'have', 'been', 'are', 'for', 'our', 'can', 'when', 'what', 'before', 'after'];

// What save_draft_document adds to a draft: the review label at the top and the Sources list at the end. They have no
// counterpart in the other version, so they are not reported as missing paragraphs.
const DRAFT_LABEL = /^\**\s*(machine[- ]drafted\b|draft \(ai\) for review\b)/i;
function draftAdditions(paras) {
  const out = new Set();
  paras.forEach((p, k) => { if (DRAFT_LABEL.test(p)) out.add(k); });
  const s = paras.findIndex((p) => /^\**sources:?\**$/i.test(p));
  if (s >= 0) for (let k = s; k < paras.length; k++) out.add(k);
  return out;
}

/** en, fr: Markdown/text, or { file }. glossary: terms from readGlossary. */
function compare(enText, frText, glossary = []) {
  const en = paragraphs(enText), fr = paragraphs(frText);
  const enAdded = draftAdditions(en), frAdded = draftAdditions(fr);
  const { E, F } = features(en, fr, glossary);
  const findings = [];
  const add = (type, i, j, detail, extra = {}) => findings.push({ type, en: i == null ? null : i + 1, fr: j == null ? null : j + 1, detail, enText: i == null ? '' : excerpt(en[i]), frText: j == null ? '' : excerpt(fr[j]), ...extra });
  for (const [i, j] of align(E, F)) {
    if (j == null) { if (!enAdded.has(i)) add('missing', i, null, `English paragraph ${i + 1} has no French counterpart.`); continue; }
    if (i == null) { if (!frAdded.has(j)) add('missing', null, j, `French paragraph ${j + 1} has no English counterpart.`); continue; }
    const e = E[i], f = F[j];
    // Terminology: mask longer matches so "renewal application" isn't also checked as "renewal".
    let masked = e.f;
    for (const t of glossary) {
      const re = new RegExp(termRe(t.en).source, 'gu');
      if (!re.test(masked)) continue;
      masked = masked.replace(re, (m, pre) => `${pre}${'#'.repeat(m.length - pre.length)}`);
      const wanted = t.keep ? [t.en] : t.fr;
      if (!wanted.length || (!t.keep && termRe(t.en).test(f.f))) continue; // left in English: reported as untranslated below
      if (!wanted.some((w) => termRe(w).test(f.f))) add('terminology', i, j, t.keep ? `"${t.en}" must stay as "${t.en}" in French.` : `"${t.en}" should be translated as "${wanted.join('" or "')}".`, { term: t.en, expected: wanted, glossaryAt: t.at });
    }
    // English left in the French text.
    const leftTerms = glossary.filter((t) => !t.keep && !t.fr.some((w) => fold(w) === fold(t.en)) && termRe(t.en).test(f.f));
    for (const t of leftTerms) add('untranslated', i, j, `English term "${t.en}" left in the French text (use "${t.fr.join('" or "')}").`, { term: t.en, expected: t.fr, glossaryAt: t.at });
    const words = ENGLISH_WORDS.filter((w) => new RegExp(`(^|[^\\p{L}])${w}(?=$|[^\\p{L}])`, 'u').test(f.text.toLowerCase()));
    if (words.length >= 2) add('untranslated', i, j, `The French text contains English words: ${words.join(', ')}.`, { words });
    // Numbers, dates and IDs.
    const { onlyA, onlyB } = multisetDiff(e.anchors.filter((a) => !a.startsWith('g:')), f.anchors.filter((a) => !a.startsWith('g:')));
    if (onlyA.length || onlyB.length) add('numbers', i, j, `Numbers, dates or IDs differ: English has ${onlyA.map(show).join(', ') || 'nothing extra'}; French has ${onlyB.map(show).join(', ') || 'nothing extra'}.`, { english: onlyA.map(show), french: onlyB.map(show) });
  }
  const count = (t) => findings.filter((f) => f.type === t).length;
  return { paragraphs: { en: en.length, fr: fr.length }, findings, summary: { terminology: count('terminology'), untranslated: count('untranslated'), numbers: count('numbers'), missing: count('missing'), total: findings.length } };
}

async function checkTerminology(enFile, frFile, glossaryFile) {
  const glossary = glossaryFile ? await readGlossary(glossaryFile) : [];
  const r = compare(readText(enFile), readText(frFile), glossary);
  const s = r.summary;
  return {
    english: path.basename(enFile), french: path.basename(frFile), glossary: glossaryFile ? `${path.basename(glossaryFile)} (${glossary.length} terms)` : 'none',
    paragraphs: r.paragraphs, summary: s,
    headline: s.total ? `${s.total} finding${s.total === 1 ? '' : 's'}: ${s.terminology} terminology, ${s.untranslated} untranslated English, ${s.numbers} number/date/ID, ${s.missing} missing paragraph${s.missing === 1 ? '' : 's'}.` : 'No differences found.',
    findings: r.findings,
    note: 'This is a machine check. Paragraph numbers count blank-line-separated blocks in each document. A translator still reviews the French version.',
  };
}

module.exports = { readGlossary, readText, paragraphs, anchors, align, compare, checkTerminology };
