/**
 * partner-me.mjs — liefert der eingeloggten Partnerin ihre eigenen LP-Daten.
 * Auth: Netlify Identity. Netlify validiert den JWT und fuellt context.clientContext.user.
 * Match: Identity-E-Mail -> Partner-Datensatz (Feld "E-Mail"). Sie sieht NUR ihren eigenen.
 */
const BASE_ID   = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const T_SEKT    = process.env.AIRTABLE_SEKTIONEN_TABLE_ID || 'tblOVhUiooGPXHQIt';
const TOKEN     = process.env.AIRTABLE_TOKEN;

const enc = encodeURIComponent;
function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
async function atList(table, params = '') {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable ${table} ${res.status}`);
  return (await res.json()).records || [];
}
function firstUrl(att) { const a = Array.isArray(att) ? att[0] : null; return a && a.url ? a.url : ''; }

export const handler = async (event, context) => {
  if (!TOKEN) return json(500, { error: 'AIRTABLE_TOKEN fehlt' });
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.email) return json(401, { error: 'Nicht eingeloggt.' });
  const email = String(user.email).toLowerCase().replace(/'/g, '');

  try {
    const recs = await atList(T_PARTNER, `maxRecords=1&filterByFormula=${enc(`LOWER({E-Mail})='${email}'`)}`);
    const p = recs[0];
    if (!p) return json(404, { error: `Kein Partner-Konto fuer ${email}. Bitte bei Michaela melden.` });
    const f = p.fields;

    let sektionen = [];
    const ids = f['Sektionen'] || [];
    if (ids.length) {
      const all = await atList(T_SEKT, `pageSize=200&sort%5B0%5D%5Bfield%5D=Reihenfolge&sort%5B0%5D%5Bdirection%5D=asc`);
      const set = new Set(ids);
      sektionen = all.filter(s => set.has(s.id)).map(s => ({
        id: s.id,
        Typ: (s.fields['Typ'] && s.fields['Typ'].name) || s.fields['Typ'] || 'Text + Button',
        Titel: s.fields['Titel'] || '',
        Text: s.fields['Text'] || '',
        'Button-Label': s.fields['Button-Label'] || '',
        'Button-Link': s.fields['Button-Link'] || '',
        Reihenfolge: s.fields['Reihenfolge'] || 0,
        Aktiv: s.fields['Aktiv'] !== false,
        Bild: firstUrl(s.fields['Bild']),
        'Bild 2': firstUrl(s.fields['Bild 2']),
      }));
    }

    return json(200, {
      partner: {
        slug: f['Slug'] || '',
        Vorname: f['Vorname'] || '',
        Anzeigename: f['Anzeigename'] || '',
        Rolle: f['Rolle'] || '',
        Intro: f['Intro'] || '',
        'Über mich': f['Über mich'] || '',
        Instagram: f['Instagram'] || '',
        Foto: firstUrl(f['Foto']),
        Titelbild: firstUrl(f['Titelbild']),
        'LP-Status': (f['LP-Status'] && f['LP-Status'].name) || f['LP-Status'] || 'Entwurf',
        'Compliance-Status': (f['Compliance-Status'] && f['Compliance-Status'].name) || f['Compliance-Status'] || 'Ungeprüft',
        'Compliance-Notiz': f['Compliance-Notiz'] || '',
      },
      sektionen,
    });
  } catch (err) {
    return json(502, { error: 'Daten konnten nicht geladen werden.' });
  }
};
