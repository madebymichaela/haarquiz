/**
 * landingpage.mjs — rendert eine Partner-Landingpage server-seitig aus Airtable.
 *
 * Routing (netlify.toml / _redirects):
 *   /team/:slug          -> /.netlify/functions/landingpage?slug=:slug   (diese Seite)
 *   /team                -> /.netlify/functions/landingpage              (Team-Uebersicht)
 *   /team/:slug/analyse  -> /index.html                                  (Quiz, unveraendert)
 *
 * Daten: Base "Haar-Analyse Leads" (AIRTABLE_BASE_ID), Tabellen Partner + Sektionen.
 * Bilder: ueber das Netlify Image CDN (/.netlify/images) — die Airtable-Quell-Domain
 *         ist in netlify.toml unter [images].remote_images freigegeben. Spaeter (Editor)
 *         werden Bilder beim Freigeben in Netlify Blobs kopiert; dann faellt die
 *         Airtable-Abhaengigkeit weg. Bis dahin: kurze HTML-Cache-Zeit (5 Min), damit
 *         die temporaeren Airtable-URLs zur Render-Zeit noch gueltig sind.
 */

const BASE_ID   = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const T_SEKT    = process.env.AIRTABLE_SEKTIONEN_TABLE_ID || 'tblOVhUiooGPXHQIt';
const TOKEN     = process.env.AIRTABLE_TOKEN;

const WA_DEFAULT = '41767587551'; // Michaela als Fallback

// ── Airtable-Helfer ───────────────────────────────────────────────────
async function atList(table, params = '') {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable ${table} ${res.status}`);
  const json = await res.json();
  return json.records || [];
}

// ── kleine Helfer ─────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

function attUrl(field) {
  const a = Array.isArray(field) ? field[0] : null;
  return a && a.url ? a.url : '';
}
// Bild ueber das Netlify Image CDN — optimiert + skaliert, formatverhandelt.
function img(field, w, h, fit = 'cover') {
  const url = attUrl(field);
  if (!url) return '';
  const q = `url=${encodeURIComponent(url)}&w=${w}${h ? `&h=${h}` : ''}&fit=${fit}`;
  return `/.netlify/images?${q}`;
}

function waLink(num) {
  const n = String(num || WA_DEFAULT).replace(/[^0-9]/g, '');
  return `https://wa.me/${n}`;
}

// ── HTML-Bausteine ────────────────────────────────────────────────────
const STYLE = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --primary:#735a31;--primary-hover:#5e4927;--primary-container:#d4b483;--on-primary:#fff;
    --surface:#faf9f6;--surface-low:#f4f3f1;--surface-mid:#efeeeb;
    --on-surface:#1a1c1a;--on-surface-var:#4d463b;--outline-var:#d1c5b7;
  }
  body{font-family:'Montserrat',sans-serif;background:var(--surface);color:var(--on-surface);line-height:1.6}
  h1,h2,h3,blockquote{font-family:'EB Garamond',serif;font-weight:500}
  img{display:block;max-width:100%}
  .wrap{max-width:640px;margin:0 auto;padding:0 20px}
  a.btn{display:inline-block;background:var(--primary);color:var(--on-primary);text-decoration:none;
    font-weight:600;font-size:15px;padding:15px 30px;border-radius:999px;margin-top:18px;transition:background .2s}
  a.btn:hover{background:var(--primary-hover)}
  a.btn.alt{background:transparent;color:var(--primary);border:1.5px solid var(--primary-container)}
  /* Hero */
  .hero{position:relative;text-align:center;padding:0 0 38px}
  .hero-bg{height:230px;background:#b0a89e center/cover no-repeat}
  .hero-photo{width:128px;height:128px;border-radius:50%;object-fit:cover;border:5px solid var(--surface);
    margin:-64px auto 0;box-shadow:0 6px 22px rgba(0,0,0,.14);background:#cdc6bb}
  .hero h1{font-size:34px;margin:16px 0 4px}
  .hero .role{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--primary)}
  .hero .intro{font-family:'EB Garamond',serif;font-size:20px;color:var(--on-surface-var);margin:16px auto 0;max-width:520px}
  .socials{margin-top:16px;display:flex;gap:14px;justify-content:center}
  .socials a{color:var(--primary);text-decoration:none;font-size:13px;font-weight:600}
  /* Sektionen */
  section.blk{padding:34px 0;border-top:1px solid var(--outline-var)}
  section.blk h2{font-size:26px;margin-bottom:12px}
  section.blk p{color:var(--on-surface-var);font-size:16px}
  .blk img.full{width:100%;border-radius:14px;margin-bottom:18px;aspect-ratio:16/10;object-fit:cover}
  .vn{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
  .vn figure{margin:0}
  .vn img{width:100%;border-radius:12px;aspect-ratio:3/4;object-fit:cover}
  .vn figcaption{text-align:center;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--primary);margin-top:6px}
  blockquote{font-size:23px;line-height:1.45;color:var(--on-surface);border-left:3px solid var(--primary-container);padding-left:18px}
  /* About */
  .about{padding:34px 0;border-top:1px solid var(--outline-var);text-align:center}
  .about img{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto 14px;background:#cdc6bb}
  .about p{font-family:'EB Garamond',serif;font-size:19px;color:var(--on-surface-var);margin-bottom:10px}
  /* Footer */
  footer{background:var(--surface-low);padding:28px 0;text-align:center;font-size:12px;color:var(--on-surface-var);margin-top:10px}
  footer a{color:var(--primary)}
  .disclaimer{max-width:520px;margin:8px auto 0;line-height:1.5}
`;

function pageShell({ title, desc, ogImg, body }) {
  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

function renderSection(f) {
  const typ   = (f['Typ'] && f['Typ'].name) || f['Typ'] || 'Text + Button';
  const titel = f['Titel'] ? `<h2>${esc(f['Titel'])}</h2>` : '';
  const text  = f['Text'] ? `<p>${nl2br(f['Text'])}</p>` : '';
  const label = f['Button-Label'];
  const link  = f['Button-Link'];
  const btn   = (label && link) ? `<a class="btn" href="${esc(link)}">${esc(label)}</a>` : '';

  if (typ === 'Zitat') {
    return `<section class="blk"><blockquote>${nl2br(f['Text'] || f['Titel'] || '')}</blockquote></section>`;
  }
  if (typ === 'Vorher/Nachher') {
    const v = img(f['Bild'], 500, 660), n = img(f['Bild 2'], 500, 660);
    const vn = (v || n) ? `<div class="vn">
      ${v ? `<figure><img src="${v}" alt="Vorher" loading="lazy"><figcaption>Vorher</figcaption></figure>` : ''}
      ${n ? `<figure><img src="${n}" alt="Nachher" loading="lazy"><figcaption>Nachher</figcaption></figure>` : ''}
    </div>` : '';
    return `<section class="blk">${titel}${vn}${text}${btn}</section>`;
  }
  if (typ === 'Bild + Text') {
    const b = img(f['Bild'], 1000, 620);
    const pic = b ? `<img class="full" src="${b}" alt="${esc(f['Titel'] || '')}" loading="lazy">` : '';
    return `<section class="blk">${pic}${titel}${text}${btn}</section>`;
  }
  // Text + Button (default)
  return `<section class="blk">${titel}${text}${btn}</section>`;
}

function renderLanding(partner, sektionen, slug) {
  const f = partner.fields;
  const name  = f['Anzeigename'] || f['Vorname'] || 'MONAT Beraterin';
  const rolle = f['Rolle'] || 'MONAT Markenpartnerin';
  const intro = f['Intro'] || '';
  const heroBg = img(f['Titelbild'], 1200, 460);
  const photo  = img(f['Foto'], 256, 256);
  const ig     = f['Instagram'];
  const wa     = f['WhatsApp'];
  const ueber  = f['Über mich'];

  const blocks = sektionen.map(s => renderSection(s.fields)).join('\n');

  const body = `
  <div class="hero">
    <div class="hero-bg" ${heroBg ? `style="background-image:url('${heroBg}')"` : ''}></div>
    ${photo ? `<img class="hero-photo" src="${photo}" alt="${esc(name)}">` : '<div class="hero-photo"></div>'}
    <div class="wrap">
      <h1>${esc(name)}</h1>
      <p class="role">${esc(rolle)}</p>
      ${intro ? `<p class="intro">${nl2br(intro)}</p>` : ''}
      <div><a class="btn" href="/team/${esc(slug)}/analyse">Jetzt Haaranalyse starten</a></div>
      <div class="socials">
        ${ig ? `<a href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a>` : ''}
        ${wa ? `<a href="${waLink(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>
    </div>
  </div>
  <main class="wrap">
    ${blocks}
    ${ueber ? `<div class="about">
      ${photo ? `<img src="${photo}" alt="${esc(name)}">` : ''}
      <p>${nl2br(ueber)}</p>
    </div>` : ''}
  </main>
  <footer>
    <div class="wrap">
      © ${new Date().getFullYear()} · ${esc(name)} · <a href="/impressum.html">Impressum &amp; Datenschutz</a>
      <p class="disclaimer">Diese Seite wird von einer unabhängigen MONAT Markenpartnerin betrieben und ist keine offizielle MONAT-Website.</p>
    </div>
  </footer>`;

  return pageShell({
    title: `${name} · Persönliche Haaranalyse`,
    desc: intro ? intro.slice(0, 155) : `Persönliche Haaranalyse mit ${name}.`,
    ogImg: attUrl(f['Titelbild']) ? img(f['Titelbild'], 1200, 630) : '',
    body,
  });
}

function renderOverview(partners) {
  const cards = partners.map(p => {
    const f = p.fields;
    const name = f['Anzeigename'] || f['Vorname'] || '';
    const slug = f['Slug'];
    const photo = img(f['Foto'], 200, 200);
    if (!slug) return '';
    return `<a class="card" href="/team/${esc(slug)}">
      ${photo ? `<img src="${photo}" alt="${esc(name)}">` : '<div class="ph"></div>'}
      <span>${esc(name)}</span></a>`;
  }).join('\n');

  const body = `
  <div class="wrap" style="padding-top:48px;text-align:center">
    <h1 style="font-size:32px;margin-bottom:8px">Unser Team</h1>
    <p style="color:var(--on-surface-var);margin-bottom:28px">Finde deine persönliche MONAT Beraterin.</p>
    <div class="grid">${cards}</div>
  </div>
  <footer><div class="wrap">© ${new Date().getFullYear()} · haar-analyse.ch
  <p class="disclaimer">Betrieben von unabhängigen MONAT Markenpartnerinnen. Keine offizielle MONAT-Website.</p></div></footer>
  <style>
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:20px;margin-bottom:40px}
    .card{text-decoration:none;color:var(--on-surface);display:flex;flex-direction:column;align-items:center;gap:10px}
    .card img,.card .ph{width:110px;height:110px;border-radius:50%;object-fit:cover;background:#cdc6bb}
    .card span{font-weight:600;font-size:14px}
  </style>`;

  return pageShell({ title: 'Unser Team · haar-analyse.ch', desc: 'Finde deine persönliche MONAT Beraterin.', body });
}

function notFound(slug) {
  const body = `<div class="wrap" style="padding:80px 20px;text-align:center">
    <h1 style="font-size:30px;margin-bottom:12px">Seite nicht gefunden</h1>
    <p style="color:var(--on-surface-var)">Diese Beraterinnen-Seite gibt es (noch) nicht.
    <br>Zur <a href="/" style="color:var(--primary)">Haaranalyse</a> oder zum <a href="/team" style="color:var(--primary)">Team</a>.</p>
  </div>`;
  return pageShell({ title: 'Nicht gefunden · haar-analyse.ch', desc: 'Seite nicht gefunden.', body });
}

// ── Handler ───────────────────────────────────────────────────────────
export const handler = async (event) => {
  const htmlHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  };

  if (!TOKEN) {
    return { statusCode: 500, headers: htmlHeaders, body: pageShell({ title: 'Fehler', desc: '', body: '<p style="padding:40px">Konfigurationsfehler: AIRTABLE_TOKEN fehlt.</p>' }) };
  }

  // Slug aus Query (von der Redirect-Regel gesetzt) oder aus dem Pfad ableiten.
  const qs = event.queryStringParameters || {};
  let slug = (qs.slug || '').toLowerCase().trim();
  if (!slug) {
    const m = (event.path || '').match(/\/team\/([^\/]+)/i);
    if (m) slug = m[1].toLowerCase().trim();
  }

  try {
    // Keine Slug -> Team-Uebersicht (nur Freigegebene).
    if (!slug) {
      const partners = await atList(T_PARTNER,
        `filterByFormula=${encodeURIComponent("{LP-Status}='Freigegeben'")}&sort%5B0%5D%5Bfield%5D=Anzeigename`);
      return { statusCode: 200, headers: htmlHeaders, body: renderOverview(partners) };
    }

    const found = await atList(T_PARTNER,
      `maxRecords=1&filterByFormula=${encodeURIComponent(`LOWER({Slug})='${slug.replace(/'/g, '')}'`)}`);
    const partner = found[0];
    const lpStatus = partner && ((partner.fields['LP-Status'] && partner.fields['LP-Status'].name) || partner.fields['LP-Status']);

    if (!partner || lpStatus !== 'Freigegeben') {
      // Noch keine freigegebene Landingpage -> wie bisher direkt zum Quiz
      // (nicht-brechend: bestehende /team/{slug}-Links fuehren weiter zur Analyse).
      return { statusCode: 302, headers: { Location: `/team/${encodeURIComponent(slug)}/analyse`, 'Cache-Control': 'no-cache' } };
    }

    // Verknuepfte Sektionen laden (ueber den Rueck-Link "Sektionen" am Partner).
    const sektIds = partner.fields['Sektionen'] || [];
    let sektionen = [];
    if (sektIds.length) {
      const all = await atList(T_SEKT, `pageSize=200&sort%5B0%5D%5Bfield%5D=Reihenfolge&sort%5B0%5D%5Bdirection%5D=asc`);
      const idset = new Set(sektIds);
      sektionen = all.filter(s => idset.has(s.id) && (s.fields['Aktiv'] === true || s.fields['Aktiv'] === undefined));
    }

    return { statusCode: 200, headers: htmlHeaders, body: renderLanding(partner, sektionen, slug) };
  } catch (err) {
    return { statusCode: 502, headers: htmlHeaders, body: pageShell({ title: 'Fehler', desc: '', body: `<p style="padding:40px">Die Seite konnte gerade nicht geladen werden. Bitte später erneut versuchen.</p>` }) };
  }
};
