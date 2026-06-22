/**
 * partner-name.mjs — oeffentlicher, schlanker Lookup: Slug -> Vorname der Partnerin.
 *
 * Zweck: Der Funnel (index.html) personalisiert die CTA-Texte schon VOR dem Absenden
 * (z.B. "Dein Profil geht direkt an <Vorname>"). Zurueckgegeben wird nur der Vorname —
 * derselbe, der ohnehin oeffentlich auf der Partner-Landingpage steht. Keine PII.
 *
 * Verhalten:
 *   - aktive Partnerin gefunden        -> { first: "<Vorname>", slug }
 *   - unbekannter/pausierter Slug      -> { first: "Michaela", slug: "michaela-antoniadis" }  (bewusst: Default-Funnel)
 *   - Airtable-Fehler / Token fehlt    -> { first: null }  (Funnel behaelt die neutralen Fallback-Texte)
 *
 * Dieselbe Lookup-Logik wie resolvePartner() in submit-quiz.mjs, nur lesend und minimal.
 */
const BASE_ID       = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const PARTNER_TABLE = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const TOKEN         = process.env.AIRTABLE_TOKEN;
const DEFAULT_SLUG  = 'michaela-antoniadis';

// Warme Function-Instanzen cachen, damit Airtable nicht bei jedem Aufruf abgefragt wird.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

function json(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify(obj),
  };
}

async function fetchRecord(slug) {
  if (!TOKEN || !BASE_ID) return null;
  const safe = String(slug).toLowerCase().replace(/'/g, '');
  const formula = `LOWER({Slug})='${safe}'`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${PARTNER_TABLE}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable partner read ${res.status}`);
  const data = await res.json();
  return (data.records && data.records[0]) || null;
}

function infoFrom(rec) {
  const f = rec.fields || {};
  const vorname = (f['Vorname'] || '').trim();
  const name    = (f['Name'] || '').trim();
  const status  = (f['Status'] || '').toString().toLowerCase();
  return {
    first:  vorname || name.split(' ')[0] || '',
    slug:   (f['Slug'] || '').toLowerCase(),
    // Nur explizit "Pausiert"/"Inaktiv" greift nicht; leer oder "Aktiv" = aktiv.
    active: !status || status === 'aktiv',
  };
}

export const handler = async (event) => {
  const qs = (event && event.queryStringParameters) || {};
  const wanted = (qs.slug && String(qs.slug).trim()) ? String(qs.slug).trim().toLowerCase() : DEFAULT_SLUG;

  const cached = cache.get(wanted);
  if (cached && cached.expires > Date.now()) return json(200, { first: cached.first, slug: cached.slug });

  let result;
  try {
    const rec  = await fetchRecord(wanted);
    const info = rec ? infoFrom(rec) : null;
    if (info && info.active && info.first) {
      result = { first: info.first, slug: info.slug || wanted };
    } else {
      // Unbekannter oder pausierter Slug -> Default-Funnel (Michaela), konsistent mit Lead-Routing.
      const def  = await fetchRecord(DEFAULT_SLUG);
      const dInf = def ? infoFrom(def) : null;
      result = { first: (dInf && dInf.first) || 'Michaela', slug: DEFAULT_SLUG };
    }
  } catch (e) {
    // Airtable nicht erreichbar -> kein Name. Der Funnel zeigt dann die neutralen Texte.
    return json(200, { first: null });
  }

  cache.set(wanted, { first: result.first, slug: result.slug, expires: Date.now() + TTL_MS });
  return json(200, result);
};
