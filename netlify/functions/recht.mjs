/**
 * recht.mjs — rendert Impressum UND Datenschutz server-seitig, partner-bewusst.
 *
 * Modell (Stand 2026-06-20):
 *   - Die jeweilige Markenpartnerin (per Slug) ist die VERANTWORTLICHE STELLE fuer ihre Leads.
 *   - mibo GmbH stellt nur das System bereit -> AUFTRAGSVERARBEITERIN, mit Admin-Zugriff (offengelegt).
 *
 * Eine Vorlage, Inhalt aus Airtable. Kein File pro Partnerin.
 *
 * Routing (netlify.toml + deploy/_redirects):
 *   /team/:slug/impressum    -> /.netlify/functions/recht?doc=impressum&slug=:slug
 *   /team/:slug/datenschutz  -> /.netlify/functions/recht?doc=datenschutz&slug=:slug
 *   /impressum               -> /.netlify/functions/recht?doc=impressum   (kein Slug -> Default Michaela)
 *   /datenschutz             -> /.netlify/functions/recht?doc=datenschutz
 *
 * Daten: Base "Haar-Analyse Leads" (AIRTABLE_BASE_ID), Tabelle Partner.
 * Hinweis: deutsche RENDER-Strings tragen Umlaute; Kommentare bleiben ASCII (Repo-Konvention).
 */

const BASE_ID   = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const TOKEN     = process.env.AIRTABLE_TOKEN;

const DEFAULT_SLUG = 'michaela-antoniadis';

// Fixe Angaben der Plattform-Betreiberin (Auftragsverarbeiterin).
const MIBO = {
  name: 'mibo GmbH',
  strasse: 'Panoramastrasse 7A',
  ort: '4665 Oftringen',
  land: 'Schweiz',
  uid: 'CHE-358.511.012',
  mail: 'info@haar-analyse.ch',
};

// ── Airtable ──────────────────────────────────────────────────────────
async function fetchPartner(slug) {
  if (!TOKEN) return null;
  const safe = String(slug).toLowerCase().replace(/'/g, '');
  const formula = `LOWER({Slug})='${safe}'`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${T_PARTNER}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable partner ${res.status}`);
  const data = await res.json();
  return (data.records && data.records[0]) || null;
}

// Airtable-Record -> Partner-Objekt fuer die Rechtsseiten.
function partnerView(rec) {
  const f = (rec && rec.fields) || {};
  const vorname  = (f['Vorname'] || '').trim();
  const nachname = (f['Nachname'] || '').trim();
  const name     = (f['Name'] || `${vorname} ${nachname}`).trim() || 'die Markenpartnerin';
  const status   = (f['Status'] || '').toString().toLowerCase();
  return {
    slug:      (f['Slug'] || '').toLowerCase(),
    name,
    first:     vorname || name.split(' ')[0] || 'die Beraterin',
    email:     (f['E-Mail'] || '').trim() || MIBO.mail,
    instagram: (f['Instagram'] || '').trim(),
    active:    !status || status === 'aktiv',
  };
}

// Minimaler Fallback (Airtable nicht erreichbar) — Seite bleibt rechtsgueltig.
function michaelaFallback() {
  return {
    slug: DEFAULT_SLUG,
    name: 'Michaela Antoniadis',
    first: 'Michaela',
    email: MIBO.mail,
    instagram: '',
    active: true,
  };
}

async function resolvePartner(slug) {
  const wanted = (typeof slug === 'string' && slug.trim()) ? slug.trim().toLowerCase() : DEFAULT_SLUG;
  try {
    const rec = await fetchPartner(wanted);
    let p = rec ? partnerView(rec) : null;
    if (!p || !p.active) {
      const def = await fetchPartner(DEFAULT_SLUG);
      p = def ? partnerView(def) : null;
    }
    return p || michaelaFallback();
  } catch (e) {
    console.warn('recht: Partner-Lookup fehlgeschlagen, Fallback:', e.message);
    return michaelaFallback();
  }
}

// ── Helfer ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stand() {
  return new Date().toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}

const STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#f8faf3;--surface:#fff;--surface-low:#f1f5ec;--primary:#1d6a63;--primary-dim:#0f4d47;
    --primary-cont:#a8f0e7;--on:#2d342c;--on-soft:#55605a;--border:rgba(45,52,44,.08);
    --fd:'Lexend',sans-serif;--fb:'Plus Jakarta Sans',sans-serif}
  body{font-family:var(--fb);background:var(--bg);color:var(--on);line-height:1.7;min-height:100vh;
    display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
  .top-nav{padding:24px 32px}
  .back{display:inline-flex;align-items:center;gap:8px;color:var(--primary);text-decoration:none;font-size:14px;font-weight:500}
  main{flex:1;padding:32px 24px 80px}
  .content{max-width:760px;margin:0 auto;background:var(--surface);padding:56px 52px;border-radius:1.5rem;box-shadow:0 4px 24px rgba(45,52,44,.04)}
  h1{font-family:var(--fd);font-size:clamp(2rem,4vw,2.6rem);font-weight:600;line-height:1.15;margin-bottom:12px;letter-spacing:-.02em}
  .subtitle{font-size:15px;color:var(--on-soft);margin-bottom:40px}
  h2{font-family:var(--fd);font-size:1.3rem;font-weight:600;margin-top:38px;margin-bottom:12px;letter-spacing:-.015em}
  h2:first-of-type{margin-top:0}
  h3{font-family:var(--fd);font-size:1.02rem;font-weight:600;margin-top:22px;margin-bottom:9px}
  p{font-size:15px;line-height:1.75;margin-bottom:15px}
  ul{margin:14px 0 18px 22px}
  li{font-size:15px;line-height:1.75;margin-bottom:7px}
  .address{background:var(--surface-low);padding:22px 26px;border-radius:1rem;margin-bottom:18px;font-size:15px;line-height:1.85}
  .address strong{font-family:var(--fd);font-weight:600;font-size:16px;display:block;margin-bottom:6px}
  .tag{display:inline-block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;
    color:var(--primary-dim);background:var(--primary-cont);padding:3px 10px;border-radius:999px;margin-bottom:10px}
  .highlight{background:var(--primary-cont);padding:15px 22px;border-radius:1rem;margin:14px 0 22px;font-size:14px;line-height:1.7}
  .highlight strong{display:block;margin-bottom:4px;color:var(--primary-dim)}
  a{color:var(--primary);text-decoration:none;font-weight:500}
  a:hover{text-decoration:underline}
  strong{font-weight:600}
  .updated{margin-top:44px;padding-top:22px;border-top:1px solid var(--border);font-size:13px;color:var(--on-soft)}
  footer{background:var(--bg);border-top:1px solid var(--border);padding:30px 20px;text-align:center}
  footer p{font-size:12px;color:var(--on-soft);margin:0}
  footer a{margin:0 6px}
  @media(max-width:640px){.content{padding:38px 26px}.top-nav{padding:20px 16px}}
`;

function shell({ title, desc, body, slug }) {
  return `<!DOCTYPE html><html lang="de-CH"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex">
<script defer data-domain="haar-analyse.ch" src="https://plausible.io/js/script.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<nav class="top-nav"><a class="back" href="/team/${esc(slug)}/analyse">&larr; Zurück zur Analyse</a></nav>
<main><article class="content">${body}</article></main>
<footer><p>&copy; ${new Date().getFullYear()} &middot; haar-analyse.ch
&middot; <a href="/team/${esc(slug)}/impressum">Impressum</a>
&middot; <a href="/team/${esc(slug)}/datenschutz">Datenschutz</a></p></footer>
</body></html>`;
}

function miboBlock() {
  return `<div class="address">
    <strong>${MIBO.name}</strong>
    ${MIBO.strasse}<br>${MIBO.ort}<br>${MIBO.land}<br><br>
    UID-Nummer: ${MIBO.uid}<br>
    Kontakt (technisch): <a href="mailto:${MIBO.mail}">${MIBO.mail}</a>
  </div>`;
}

// ── Impressum ─────────────────────────────────────────────────────────
function renderImpressum(p) {
  const igLine = p.instagram ? `Instagram: <a href="${esc(p.instagram)}" target="_blank" rel="noopener">${esc(p.instagram)}</a><br>` : '';
  const body = `
    <h1>Impressum</h1>
    <p class="subtitle">Diese Haaranalyse wird dir von einer unabhängigen MONAT-Markenpartnerin angeboten. Das technische System stellt die ${MIBO.name} bereit.</p>

    <span class="tag">Beratung &amp; Daten</span>
    <h2>Anbieterin dieser Beratungsseite</h2>
    <div class="address">
      <strong>${esc(p.name)}</strong>
      Unabhängige MONAT-Markenpartnerin<br>
      ${igLine}
      Kontakt: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>
    </div>
    <p>${esc(p.first)} betreut diese Seite, wertet deine Haaranalyse aus und ist die verantwortliche Stelle für deine Daten. An sie richtest du alle Fragen zur Beratung und zum Datenschutz.</p>

    <span class="tag">Technik</span>
    <h2>Technische Plattform</h2>
    ${miboBlock()}
    <p>Die ${MIBO.name} stellt das System haar-analyse.ch bereit und betreibt es technisch im Auftrag der angeschlossenen Markenpartnerinnen. Sie ist nicht verantwortlich für die einzelne Beratung und verwendet die eingegebenen Daten nicht für eigene Zwecke.</p>

    <h2>Unabhängigkeitshinweis</h2>
    <p>${esc(p.name)} ist eine unabhängige MONAT-Markenpartnerin. Diese Seite ist keine offizielle Website der MONAT Global Corp. Produktnamen und Markenzeichen sind Eigentum ihrer jeweiligen Inhaber.</p>

    <h2>Haftungsausschluss</h2>
    <p>Die Informationen auf dieser Website dienen der allgemeinen Orientierung und stellen keine medizinische oder dermatologische Beratung dar. Bei anhaltenden Kopfhaut- oder Haarproblemen empfehlen wir die Konsultation einer Fachperson (Dermatologie, Hausarzt, Frauenarzt). Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte wird keine Haftung übernommen.</p>

    <h2>Haftung für externe Links</h2>
    <p>Diese Website verweist auf externe Inhalte, insbesondere auf Instagram-Profile und auf Produktseiten von MONAT Global Corp. Für den Inhalt dieser externen Seiten sind ausschliesslich deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine rechtswidrigen Inhalte erkennbar.</p>

    <h2>Urheberrechte</h2>
    <p>Gestaltung, Layout und Code dieser Website sind urheberrechtlich geschützt; die Rechte daran liegen bei der ${MIBO.name}. Die persönlichen Texte und Bilder einer Beratungsseite liegen bei der jeweiligen Markenpartnerin. Eine Weiterverwendung ausserhalb der engen Grenzen des Urheberrechts bedarf der vorherigen schriftlichen Zustimmung der jeweils Berechtigten.</p>

    <p class="updated">Verantwortliche Stelle: ${esc(p.name)} &middot; Plattform: ${MIBO.name} &middot; Stand: ${stand()}</p>`;
  return shell({ title: `Impressum — ${p.name}`, desc: `Rechtliche Angaben zur Beratungsseite von ${p.name} auf haar-analyse.ch.`, body, slug: p.slug });
}

// ── Datenschutz ───────────────────────────────────────────────────────
function renderDatenschutz(p) {
  const body = `
    <h1>Datenschutzerklärung</h1>
    <p class="subtitle">Diese Erklärung beschreibt transparent, wie auf <strong>haar-analyse.ch</strong> mit deinen Daten umgegangen wird. Es gilt das Schweizer Datenschutzgesetz (DSG) und — soweit anwendbar — die EU-Datenschutz-Grundverordnung (DSGVO).</p>

    <h2>1. Verantwortliche Stelle</h2>
    <p>Verantwortlich für deine Daten ist die Markenpartnerin, deren Seite du nutzt:</p>
    <div class="address">
      <strong>${esc(p.name)}</strong>
      Unabhängige MONAT-Markenpartnerin<br>
      Kontakt für Datenschutzanfragen: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>
    </div>
    <p>Sie entscheidet über die Verarbeitung deiner Analyse-Daten und ist deine Ansprechpartnerin für alle Datenschutz-Rechte.</p>
    <p>Das technische System haar-analyse.ch wird von der <strong>${MIBO.name}</strong> (${MIBO.strasse}, ${MIBO.ort}, <a href="mailto:${MIBO.mail}">${MIBO.mail}</a>) bereitgestellt und betrieben. Die ${MIBO.name} handelt dabei als <strong>Auftragsverarbeiterin</strong> im Auftrag der Markenpartnerin und verwendet deine Daten nicht für eigene Zwecke.</p>

    <h2>2. Grundsatz</h2>
    <p>Es werden nur die Personendaten verarbeitet, die für die unten genannten Zwecke nötig sind. Deine Daten werden nicht zu Werbezwecken an Dritte weitergegeben oder verkauft.</p>

    <h2>3. Haaranalyse und Kontaktformular</h2>
    <p>Wenn du die Haaranalyse ausfüllst, werden folgende Daten erhoben: Vorname, E-Mail-Adresse und Mobilnummer (für die Beratung per WhatsApp) — diese drei sind Pflichtangaben — sowie deine Angaben zu Haarstruktur, Haartyp, Kopfhaut, Gewohnheiten und Pflege-Zielen.</p>
    <div class="highlight">
      <strong>Zweck</strong>
      Die Daten werden ausschliesslich dazu verwendet, dir eine persönliche, unverbindliche Produkt-Empfehlung durch ${esc(p.first)} zukommen zu lassen — in der Regel per Sprachnachricht via Instagram oder per E-Mail.
    </div>
    <p><strong>Deine Daten gehen nur an diese eine Markenpartnerin.</strong> Sie werden nicht an andere Partnerinnen weitergegeben, nicht zentral für Werbung ausgewertet und nicht verkauft. ${esc(p.first)} ist verpflichtet, deine Daten ausschliesslich für die Beratung im Zusammenhang mit deiner Anfrage zu verwenden.</p>
    <h3>Rechtsgrundlage</h3>
    <p>Deine Einwilligung durch das aktive Ausfüllen und Absenden der Analyse (DSGVO Art. 6 Abs. 1 lit. a, DSG Art. 31 Abs. 1). Diese Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen.</p>
    <h3>Speicherdauer</h3>
    <p>Deine Daten werden so lange gespeichert, wie dies für die Beantwortung und eine allfällige Folgekommunikation erforderlich ist, höchstens jedoch 12 Monate — sofern du nicht in eine längere Aufbewahrung einwilligst (etwa im Rahmen einer Kundenbetreuung nach einem Kauf).</p>

    <h2>4. Dienstleister (Auftragsverarbeiter)</h2>
    <p>Für Betrieb, Hosting, Datenbank, E-Mail-Versand sowie das Laden von Schriftarten und einer Bild-Funktion setzen wir spezialisierte Dienstleister als Auftragsverarbeiter ein. Dabei werden technisch notwendige Daten (z.B. IP-Adresse, Zeitpunkt, Browser) und — bei Datenbank und E-Mail — deine Analyse-Angaben verarbeitet. Ein Teil dieser Dienstleister verarbeitet Daten in den <strong>USA</strong>; für diese Übermittlung bestehen anerkannte Garantien (EU-U.S. Data Privacy Framework bzw. EU-Standardvertragsklauseln).</p>
    <div class="highlight">
      <strong>Wer Zugriff hat</strong>
      Deine Analyse-Daten sind nur deiner Beraterin zugänglich — andere Markenpartnerinnen haben keinen Zugriff. Die ${MIBO.name} betreibt das System technisch und hat als Auftragsverarbeiterin administrativen Zugriff, soweit das für Betrieb und Support nötig ist. Sie ist zur Vertraulichkeit verpflichtet und verwendet deine Daten nicht für eigene Zwecke.
    </div>
    <p>Die konkret eingesetzten Dienstleister nennen wir dir auf Anfrage jederzeit.</p>

    <h2>5. Cookies und Browser-Speicher</h2>
    <p>Diese Website setzt <strong>keine Cookies</strong> und speichert keine Daten in deinem Browser. Deine Analyse-Antworten existieren nur während der aktuellen Sitzung im Arbeitsspeicher und werden erst beim aktiven Absenden übertragen.</p>

    <h2>6. Reichweiten-Messung</h2>
    <p>Diese Website nutzt eine <strong>datenschutzfreundliche, cookie-freie Reichweiten-Messung</strong>, die in der EU gehostet wird und keine personenbezogenen Daten speichert: keine Cookies, keine IP-Speicherung, kein Nutzer-Profil, kein Cross-Site-Tracking. Erfasst werden nur aggregierte, anonyme Statistiken. Rechtsgrundlage: berechtigtes Interesse (DSG Art. 31 Abs. 2 lit. b, DSGVO Art. 6 Abs. 1 lit. f).</p>

    <h2>7. Deine Rechte</h2>
    <p>Du hast jederzeit das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerruf einer Einwilligung sowie Datenübertragbarkeit. Deine Anfrage richtest du an deine Beraterin: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>. Bei rein technischen Anliegen erreichst du die Plattform unter <a href="mailto:${MIBO.mail}">${MIBO.mail}</a>. Zusätzlich hast du das Recht, dich beim <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener">EDÖB</a> zu beschweren.</p>

    <h2>8. Externe Links</h2>
    <p>Diese Website verlinkt auf externe Dienste (insbesondere Instagram und Produktseiten von MONAT Global Corp.). Für die Datenverarbeitung auf diesen Seiten sind deren Betreiber verantwortlich.</p>

    <h2>9. Anpassungen</h2>
    <p>Diese Erklärung kann angepasst werden, um aktuellen rechtlichen oder technischen Anforderungen gerecht zu werden. Die aktuelle Fassung ist jederzeit über diese Seite abrufbar.</p>

    <p class="updated">Verantwortliche Stelle: ${esc(p.name)} &middot; Auftragsverarbeiterin: ${MIBO.name} &middot; Stand: ${stand()}</p>`;
  return shell({ title: `Datenschutz — ${p.name}`, desc: `Wie auf der Beratungsseite von ${p.name} mit deinen Daten umgegangen wird.`, body, slug: p.slug });
}

// ── Handler ───────────────────────────────────────────────────────────
export const handler = async (event) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' };

  const qs = event.queryStringParameters || {};
  let slug = (qs.slug || '').toLowerCase().trim();
  if (!slug) {
    const m = (event.path || '').match(/\/team\/([^\/]+)/i);
    if (m) slug = m[1].toLowerCase().trim();
  }
  const doc = (qs.doc || (/datenschutz/i.test(event.path || '') ? 'datenschutz' : 'impressum')).toLowerCase();

  const partner = await resolvePartner(slug);
  const html = doc === 'datenschutz' ? renderDatenschutz(partner) : renderImpressum(partner);
  return { statusCode: 200, headers, body: html };
};
