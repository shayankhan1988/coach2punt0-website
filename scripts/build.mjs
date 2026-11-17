// Bouwt de website: kopieert site/ naar dist/ en vult de teksten en foto's
// in uit content/*.json (die Mounir via Pages CMS aanpast).
//
// In de HTML staan markeringen zoals:
//   <!--cms:t:home.hero.titel-->Oude tekst<!--/cms:home.hero.titel-->
// Het eerste deel van de sleutel is het bestand (content/home.json), de rest
// is het pad in dat bestand. Soorten:
//   t            gewone tekst (een enter wordt een regelafbreking)
//   img          foto; de alt-tekst staat in <sleutel>_alt
//   list:<naam>  een lijst, opgebouwd met een van de renderers hieronder
//
// Zonder wijzigingen in content/ is dist/ precies gelijk aan site/ (zonder
// de markeringen). Gaat er iets mis (ontbrekend veld, foto niet gevonden),
// dan stopt de build en blijft de vorige versie van de site gewoon online.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');

// Contactgegevens zoals ze in de HTML staan. Wijkt content/algemeen.json
// hiervan af, dan worden ze op alle pagina's (ook in JSON-LD en llms.txt) vervangen.
const BASE_TEL = '06 21 97 13 29';
const BASE_EMAIL = 'contact@coach2punt0.nl';

const fail = (msg) => { console.error(`\nBuild gestopt: ${msg}\n`); process.exit(1); };

// ---------- content laden ----------
const content = {};
for (const f of fs.readdirSync(CONTENT)) {
  if (!f.endsWith('.json')) continue;
  try { content[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')); }
  catch (e) { fail(`content/${f} is geen geldige JSON (${e.message})`); }
}
const get = (key) => {
  let v = content;
  for (const p of key.split('.')) {
    if (v == null || !(p in v)) fail(`veld "${key}" ontbreekt in content/`);
    v = v[p];
  }
  return v;
};
const getOpt = (key) => { let v = content; for (const p of key.split('.')) { if (v == null || !(p in v)) return undefined; v = v[p]; } return v; };
const pageOf = (key) => { const parts = key.split('.'); parts.pop(); return parts.length ? get(parts.join('.')) : {}; };

// ---------- helpers ----------
const esc = (s) => String(s ?? '').trim().replace(/\r\n?/g, '\n')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const escAttr = (s) => String(s ?? '').trim().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paras = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p)}</p>`).join('');
const arr = (v, key) => { if (v == null) return []; if (!Array.isArray(v)) fail(`veld "${key}" moet een lijst zijn`); return v; };

const renderers = {
  cijfers: (v, k) => arr(v, k).map((x) => `<li><strong>${esc(x.getal)}</strong><span>${esc(x.tekst)}</span></li>`).join(''),
  chips: (v, k) => arr(v, k).filter((x) => String(x ?? '').trim()).map((x) => `<li>${esc(x)}</li>`).join(''),
  lijst: (v, k) => arr(v, k).filter((x) => String(x ?? '').trim()).map((x) => `<li>${esc(x)}</li>`).join(''),
  kaartjes: (v, k) => arr(v, k).map((x) => `<li><h3>${esc(x.titel)}</h3><p>${esc(x.tekst)}</p></li>`).join(''),
  vacatures: (v, k, page) => {
    const list = arr(v, k).filter((x) => x && String(x.titel ?? '').trim());
    if (!list.length) return `<p>${esc(page.geen_vacatures)}</p>`;
    return list.map((x) => {
      const meta = String(x.uren ?? '').trim() ? ` · ${esc(x.uren)}` : '';
      return `<p><strong>${esc(x.titel)}</strong>${meta}</p>${paras(x.omschrijving)}`;
    }).join('');
  },
  faq: (v, k) => arr(v, k).map((g) =>
    `<h2 class="group">${esc(g.titel)}</h2><div class="faq">` +
    arr(g.vragen, k).map((q) => `<details><summary>${esc(q.vraag)}</summary><div class="a">${paras(q.antwoord)}</div></details>`).join('') +
    '</div>').join(''),
};

// ---------- foto's ----------
let sharp = null;
async function loadSharp() {
  if (sharp === null) {
    try { sharp = (await import('sharp')).default; } catch { sharp = false; }
  }
  return sharp;
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const setAttr = (tag, name, val) => tag.match(new RegExp(`\\s${name}="[^"]*"`))
  ? tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${val}"`)
  : tag.replace(/^<img/, `<img ${name}="${val}"`);
const dropAttr = (tag, name) => tag.replace(new RegExp(`\\s${name}="[^"]*"`), '');

const imageSwaps = []; // { html, oldSrc, oldSrcset, newSrc, newSrcset }

async function renderImg(tag, key, file) {
  let value = String(get(key) ?? '').trim();
  const alt = get(`${key}_alt`);
  let out = setAttr(tag, 'alt', escAttr(alt));
  const oldSrc = attr(tag, 'src');
  if (!value || value === oldSrc) return out;
  if (!value.startsWith('/')) value = '/' + value;

  const srcPath = path.join(SITE, decodeURI(value));
  if (!srcPath.startsWith(SITE) || !fs.existsSync(srcPath)) fail(`foto "${value}" (veld ${key}) bestaat niet in site/`);
  const oldSrcset = attr(tag, 'srcset');
  const W = Number(attr(tag, 'width')) || 1200;
  const H = Number(attr(tag, 'height')) || 900;

  // Bestaande foto van de site gekozen (met een -640 variant)? Die direct gebruiken.
  const m = value.match(/^(\/assets\/img\/.+)-1200\.webp$/);
  if (m && fs.existsSync(path.join(SITE, `${m[1]}-640.webp`))) {
    const newSrcset = `${m[1]}-640.webp 640w, ${value} 1200w`;
    out = setAttr(out, 'src', value);
    out = oldSrcset ? setAttr(out, 'srcset', newSrcset) : out;
    imageSwaps.push({ file, oldSrc, oldSrcset, newSrc: value, newSrcset: oldSrcset ? newSrcset : null });
    return out;
  }

  // Nieuwe foto: bijsnijden naar dezelfde verhouding en verkleinen naar webp.
  const s = await loadSharp();
  if (!s) {
    console.warn(`Let op: sharp niet beschikbaar, foto ${value} wordt niet verkleind.`);
    out = setAttr(out, 'src', encodeURI(decodeURI(value)));
    out = dropAttr(dropAttr(out, 'srcset'), 'sizes');
    imageSwaps.push({ file, oldSrc, oldSrcset, newSrc: encodeURI(decodeURI(value)), newSrcset: null });
    return out;
  }
  const widths = oldSrcset ? [640, 1200] : [Math.min(W * 2, 1600)];
  const buf = fs.readFileSync(srcPath);
  const hash = crypto.createHash('sha1').update(buf).update(`${W}x${H}`).digest('hex').slice(0, 8);
  const base = path.basename(srcPath).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto';
  fs.mkdirSync(path.join(DIST, 'assets/img/cms'), { recursive: true });
  const urls = [];
  for (const w of widths) {
    const name = `${base}-${hash}-${w}.webp`;
    const dest = path.join(DIST, 'assets/img/cms', name);
    if (!fs.existsSync(dest)) {
      await s(buf).rotate().resize({ width: w, height: Math.round((w * H) / W), fit: 'cover', position: 'attention' })
        .webp({ quality: 80 }).toFile(dest);
    }
    urls.push([`/assets/img/cms/${name}`, w]);
  }
  const newSrc = urls[urls.length - 1][0];
  const newSrcset = oldSrcset ? urls.map(([u, w]) => `${u} ${w}w`).join(', ') : null;
  out = setAttr(out, 'src', newSrc);
  if (newSrcset) out = setAttr(out, 'srcset', newSrcset);
  imageSwaps.push({ file, oldSrc, oldSrcset, newSrc, newSrcset });
  return out;
}

// ---------- FAQ in JSON-LD bijwerken ----------
function updateFaqJsonLd(html) {
  const groups = content.faq?.groepen;
  if (!Array.isArray(groups)) return html;
  const entities = groups.flatMap((g) => arr(g.vragen, 'faq.groepen')).map((q) => ({
    '@type': 'Question',
    name: String(q.vraag ?? '').trim(),
    acceptedAnswer: { '@type': 'Answer', text: String(q.antwoord ?? '').replace(/\s*\n\s*/g, ' ').trim() },
  }));
  const norm = (list) => JSON.stringify([...list].map((e) => [e.name, e.acceptedAnswer?.text]).sort());
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, json) => {
    let data; try { data = JSON.parse(json); } catch { return whole; }
    const nodes = data['@graph'] || [data];
    const faq = nodes.find((n) => n['@type'] === 'FAQPage');
    if (!faq || norm(faq.mainEntity || []) === norm(entities)) return whole;
    faq.mainEntity = entities;
    return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  });
}

// ---------- contactgegevens ----------
function phoneVariants(display) {
  const digits = display.replace(/[^\d+]/g, '');
  let national;
  if (/^\+31\d{9}$/.test(digits)) national = '0' + digits.slice(3);
  else if (/^0031\d{9}$/.test(digits)) national = '0' + digits.slice(4);
  else if (/^0\d{9}$/.test(digits)) national = digits;
  else fail(`telefoonnummer "${display}" klopt niet; gebruik bijvoorbeeld 06 12 34 56 78`);
  return { display: display.trim(), national, intl: '+31' + national.slice(1) };
}


// ---------- thema (kleurenset en achtergrond) ----------
// Alleen vooraf geteste kleurensets: tekst, links en knoppen houden overal
// minstens WCAG AA-contrast (4,5:1), in licht en donker. Merkkleuren en logo
// blijven gelijk. Bij "standaard" met alles aan verandert er niets.
const THEMAS = {
  warm: {
    light: { bg: '#FBF7F1', surface: '#F7EEE6', line: '#EADFD3', 'p-lav': '#FCE6DC', 'p-mint': '#FFF0D4', 'p-peach': '#FFE0D3', 'p-sky': '#F6E6EE', 'p-butter': '#FFF1C9' },
    dark: { bg: '#1B1520', surface: '#261D2A', line: '#3E3040', 'p-lav': '#3A2730', 'p-mint': '#36301E', 'p-peach': '#40262A', 'p-sky': '#33233A', 'p-butter': '#3A321E' },
  },
  fris: {
    light: { bg: '#F6FBFA', surface: '#E8F4F0', line: '#D4E7E1', 'p-lav': '#E1EFFA', 'p-mint': '#DAF3E9', 'p-peach': '#E5F5EC', 'p-sky': '#DAEEF9', 'p-butter': '#E9F6E1' },
    dark: { bg: '#0F191C', surface: '#162428', line: '#2A3E42', 'p-lav': '#1C2F47', 'p-mint': '#1B3934', 'p-peach': '#1E3433', 'p-sky': '#1A2E40', 'p-butter': '#253522' },
  },
  rustig: {
    light: { bg: '#FFFFFF', surface: '#F6F5F9', line: '#E6E4EE', 'p-lav': '#F1EFF8', 'p-mint': '#EFF5F2', 'p-peach': '#F8F1EE', 'p-sky': '#EEF3F8', 'p-butter': '#F8F5EA' },
    dark: { bg: '#141318', surface: '#1D1C23', line: '#33313D', 'p-lav': '#26243A', 'p-mint': '#1F2B28', 'p-peach': '#2D2326', 'p-sky': '#1F2834', 'p-butter': '#2B2920' },
  },
};
function themeCss() {
  const t = content.thema || {};
  const naam = String(t.kleuren || 'standaard');
  if (naam !== 'standaard' && !THEMAS[naam]) fail(`onbekend thema "${naam}"`);
  const parts = [];
  if (THEMAS[naam]) {
    const vars = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');
    parts.push(`:root{${vars(THEMAS[naam].light)}}`, `:root[data-theme="dark"]{${vars(THEMAS[naam].dark)}}`);
  }
  if (t.kleurverloop === false) parts.push('html{background:var(--bg)}');
  if (t.versiering === false) parts.push('body::before{display:none}');
  if (!parts.length) return null;
  return { css: `/* Gemaakt door scripts/build.mjs uit content/thema.json */\n${parts.join('\n')}\n`, bg: THEMAS[naam]?.light.bg };
}
const theme = themeCss();

// ---------- uitvoeren ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SITE, DIST, { recursive: true });

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const files = walk(DIST);

const MARK = /<!--cms:(t|img|list:\w+):([\w.]+)-->([\s\S]*?)<!--\/cms:\2-->/g;
const tel = phoneVariants(String(get('algemeen.telefoon')));
const base = phoneVariants(BASE_TEL);
const email = String(get('algemeen.email')).trim();
if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) fail(`e-mailadres "${email}" klopt niet`);

let count = 0;
for (const file of files) {
  const isHtml = file.endsWith('.html');
  if (!isHtml && !/\.(txt|xml)$/.test(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;

  if (isHtml) {
    const jobs = [];
    html.replace(MARK, (whole, kind, key, inner) => { jobs.push({ whole, kind, key, inner }); return whole; });
    for (const j of jobs) {
      let out;
      if (j.kind === 't') out = esc(get(j.key));
      else if (j.kind === 'img') out = await renderImg(j.inner, j.key, file);
      else {
        const r = renderers[j.kind.slice(5)];
        if (!r) fail(`onbekende lijstsoort ${j.kind}`);
        out = r(getOpt(j.key), j.key, pageOf(j.key));
      }
      html = html.replace(j.whole, () => out);
      count++;
    }
    if (html.includes('<!--cms:')) fail(`${path.relative(DIST, file)} bevat een kapotte markering`);
    // Preload van een vervangen foto meeveranderen
    for (const sw of imageSwaps.filter((s) => s.file === file)) {
      html = html.replace(/<link rel="preload" as="image"[^>]*>/g, (link) => {
        if (attr(link, 'href') !== sw.oldSrc) return link;
        let l = setAttr(link, 'href', sw.newSrc);
        l = sw.newSrcset ? setAttr(l, 'imagesrcset', sw.newSrcset) : dropAttr(dropAttr(l, 'imagesrcset'), 'imagesizes');
        return l;
      });
    }
    if (theme) {
      html = html.replace('<link rel="stylesheet" href="/assets/styles.css">', '<link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/theme.css">');
      if (theme.bg) html = html.replace('<meta name="theme-color" content="#FBF9F6">', `<meta name="theme-color" content="${theme.bg}">`);
    }
    if (file.endsWith(path.join('veelgestelde-vragen', 'index.html'))) html = updateFaqJsonLd(html);
  }

  if (tel.national !== base.national || tel.display !== base.display) {
    html = html.split(base.intl).join(tel.intl).split(base.national).join(tel.national).split(base.display).join(tel.display);
  }
  if (email !== BASE_EMAIL) html = html.split(BASE_EMAIL).join(email);

  if (html !== orig) fs.writeFileSync(file, html);
}

if (theme) fs.writeFileSync(path.join(DIST, 'assets/theme.css'), theme.css);
console.log(`Klaar: ${count} bewerkbare onderdelen ingevuld, ${imageSwaps.length} foto('s) vervangen. Uitvoer in dist/`);
