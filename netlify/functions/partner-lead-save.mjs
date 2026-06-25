/**
 * partner-lead-save.mjs — aktualisiert EINEN Lead der eingeloggten Partnerin.
 * Auth: Netlify Identity (context.clientContext.user).
 * Sicherheit: der Lead wird serverseitig neu geholt und es wird geprueft, dass sein
 * Partner-Link den Datensatz der eingeloggten Partnerin enthaelt — sonst 403.
 * Schreibbar sind NUR: Prozess (Pipeline-Status), Notizen, Abschluss-Datum.
 *
 * Abschluss-Datum: wird automatisch auf heute gesetzt, sobald der Prozess auf eine
 * Abschluss-Stufe wechselt (Kunde VIP / Kunde Einzelhandel / Markenpartner) und noch
 * keines gesetzt ist. Wechselt sie zurueck auf eine Nicht-Abschluss-Stufe, wird es geleert.
 */
const BASE_ID   = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const T_LEADS   = process.env.AIRTABLE_TABLE_ID || 'tblqAtKL3R8X1rNhN';
const TOKEN     = process.env.AIRTABLE_TOKEN;

const enc = encodeURIComponent;

// Erlaubte Pipeline-Werte (inkl. "Kein Interesse" — wird via typecast angelegt, falls noch nicht da).
const PROZESS = ['Warten auf WhatsApp', 'WhatsApp erhalten', 'Beratungsphase', 'Kunde VIP', 'Kunde Einzelhandel', 'Markenpartner', 'Später', 'Kein Interesse'];
const ABSCHLUSS_STUFEN = new Set(['Kunde VIP', 'Kunde Einzelhandel', 'Markenpartner']);

function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
async function at(method, path, body) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Airtable ${method} ${path} ${res.status}`);
  return res.json();
}
function selName(v) { return (v && v.name) ? v.name : (v || ''); }
function todayCH() {
  // YYYY-MM-DD in Europe/Zurich
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
}

export const handler = async (event, context) => {
  if (!TOKEN) return json(500, { error: 'AIRTABLE_TOKEN fehlt' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST.' });
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.email) return json(401, { error: 'Nicht eingeloggt.' });
  const email = String(user.email).toLowerCase().replace(/'/g, '');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Ungueltige Daten.' }); }
  const leadId = String(payload.id || '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(leadId)) return json(400, { error: 'Lead-ID fehlt oder ungueltig.' });

  try {
    // Eigenen Partner-Datensatz holen.
    const pj = await at('GET', `${T_PARTNER}?maxRecords=1&filterByFormula=${enc(`LOWER({E-Mail})='${email}'`)}`);
    const partner = (pj.records || [])[0];
    if (!partner) return json(404, { error: `Kein Partner-Konto fuer ${email}.` });
    const partnerId = partner.id;

    // Ziel-Lead serverseitig holen und Eigentum pruefen.
    const lj = await at('GET', `${enc(T_LEADS)}/${leadId}`);
    const owners = lj.fields && lj.fields['Partner'] || [];
    if (!owners.includes(partnerId)) return json(403, { error: 'Dieser Lead gehoert nicht zu deinem Konto.' });

    // Nur erlaubte Felder schreiben.
    const fields = {};
    if (typeof payload.prozess === 'string' && PROZESS.includes(payload.prozess)) {
      fields['Prozess'] = payload.prozess;
    }
    if (typeof payload.notizen === 'string') {
      fields['Notizen'] = payload.notizen;
    }

    // Abschluss-Datum-Logik (nur wenn Prozess mitgeschickt wurde).
    if (fields['Prozess']) {
      const hatDatum = !!(lj.fields && lj.fields['Abschluss-Datum']);
      if (ABSCHLUSS_STUFEN.has(fields['Prozess']) && !hatDatum) {
        fields['Abschluss-Datum'] = todayCH();
      } else if (!ABSCHLUSS_STUFEN.has(fields['Prozess']) && hatDatum) {
        fields['Abschluss-Datum'] = null; // zuruecksetzen, wenn kein Abschluss mehr
      }
    }

    if (Object.keys(fields).length === 0) return json(400, { error: 'Nichts zu speichern.' });

    const updated = await at('PATCH', `${enc(T_LEADS)}/${leadId}`, { fields, typecast: true });
    const f = updated.fields || {};
    return json(200, {
      ok: true,
      lead: {
        id: updated.id,
        prozess: selName(f['Prozess']) || '',
        notizen: f['Notizen'] || '',
        abschluss: f['Abschluss-Datum'] || '',
      },
    });
  } catch (err) {
    return json(502, { error: 'Speichern fehlgeschlagen. Bitte spaeter erneut versuchen.' });
  }
};
