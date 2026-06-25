/**
 * partner-leads.mjs — liefert der eingeloggten Partnerin ihre eigenen Leads.
 * Auth: Netlify Identity (context.clientContext.user). Match ueber die Login-E-Mail
 * -> Partner-Datensatz (Feld "E-Mail"). Sie sieht NUR ihre eigenen Leads.
 *
 * Sicherheit: gefiltert wird ueber den Backlink "Kontakte Leads" am Partner-Datensatz
 * (recordId-genau), NICHT ueber den Partner-Namen (Namen koennen kollidieren).
 */
const BASE_ID    = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER  = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const T_LEADS    = process.env.AIRTABLE_TABLE_ID || 'tblqAtKL3R8X1rNhN';
const TOKEN      = process.env.AIRTABLE_TOKEN;

const enc = encodeURIComponent;

function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
async function at(path) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable ${path} ${res.status}`);
  return res.json();
}
// multipleSelects -> "A, B und C" ; oder einfacher Wert -> String
function joinSelect(v) {
  if (!Array.isArray(v)) return v ? String(v) : '';
  const names = v.map(x => (x && x.name) ? x.name : x).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1];
}
function selName(v) { return (v && v.name) ? v.name : (v || ''); }

// Leads in Bloecken von je 100 ueber RECORD_ID() holen (praezise, ohne Namens-Kollision).
async function fetchLeadsByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const formula = `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(',')})`;
    let cursor = '';
    do {
      const params = `pageSize=100&filterByFormula=${enc(formula)}` + (cursor ? `&offset=${enc(cursor)}` : '');
      const j = await at(`${enc(T_LEADS)}?${params}`);
      out.push(...(j.records || []));
      cursor = j.offset || '';
    } while (cursor);
  }
  return out;
}

export const handler = async (event, context) => {
  if (!TOKEN) return json(500, { error: 'AIRTABLE_TOKEN fehlt' });
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.email) return json(401, { error: 'Nicht eingeloggt.' });
  const email = String(user.email).toLowerCase().replace(/'/g, '');

  try {
    // Eigenen Partner-Datensatz holen (autoritativ).
    const pj = await at(`${T_PARTNER}?maxRecords=1&filterByFormula=${enc(`LOWER({E-Mail})='${email}'`)}`);
    const partner = (pj.records || [])[0];
    if (!partner) return json(404, { error: `Kein Partner-Konto fuer ${email}. Bitte bei Michaela melden.` });

    const leadIds = partner.fields['Kontakte Leads'] || [];
    let leads = [];
    if (leadIds.length) {
      const recs = await fetchLeadsByIds(leadIds);
      leads = recs.map(r => {
        const f = r.fields;
        return {
          id: r.id,
          name: f['Name'] || '',
          email: f['Email'] || '',
          telefon: f['Telefon'] || '',
          datum: f['Datum'] || '',                       // createdTime (ISO)
          abschluss: f['Abschluss-Datum'] || '',          // YYYY-MM-DD oder ''
          prozess: selName(f['Prozess']) || '',           // kanonische Pipeline
          struktur: joinSelect(f['Struktur']),
          haartyp: joinSelect(f['Haartyp']),
          kopfhaut: joinSelect(f['Kopfhaut']),
          alltag: joinSelect(f['Alltag']),
          ziel: joinSelect(f['Primäres Ziel']),
          wuensche: joinSelect(f['Alle Wünsche']),
          alter: f['Alter'] || '',
          kinder: f['Kinder'] || '',
          allergien: f['Allergien'] || '',
          waschen: f['Waschen'] || '',
          monat: f['MONAT Interesse'] || '',
          notizen: f['Notizen'] || '',
        };
      });
      // Neueste zuerst.
      leads.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
    }

    return json(200, {
      partner: {
        slug: partner.fields['Slug'] || '',
        Anzeigename: partner.fields['Anzeigename'] || partner.fields['Vorname'] || '',
        Monatsziel: partner.fields['Monatsziel Leads'] || 0,
      },
      leads,
    });
  } catch (err) {
    return json(502, { error: 'Leads konnten nicht geladen werden.' });
  }
};
