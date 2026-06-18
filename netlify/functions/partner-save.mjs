/**
 * partner-save.mjs — speichert die LP-Inhalte der eingeloggten Partnerin.
 * Auth: Netlify Identity (context.clientContext.user). Sie kann NUR ihren eigenen
 * Datensatz und ihre eigenen Sektionen aendern (recordId kommt vom Server, nicht vom Client).
 * Ablauf: KI-Compliance-Pruefung -> Felder + Sektionen nach Airtable schreiben ->
 *         Compliance-Status/-Notiz setzen. LP-Status wird NIE auf "Freigegeben" gesetzt
 *         (Freigabe ist Michaelas menschlicher Schritt).
 */
const BASE_ID   = process.env.AIRTABLE_BASE_ID || 'appHBx5NoCSiBtkl3';
const T_PARTNER = process.env.AIRTABLE_PARTNER_TABLE_ID || 'tblkzshCdPINgQ2uF';
const T_SEKT    = process.env.AIRTABLE_SEKTIONEN_TABLE_ID || 'tblOVhUiooGPXHQIt';
const TOKEN     = process.env.AIRTABLE_TOKEN;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const enc = encodeURIComponent;
const TYPEN = ['Text + Button', 'Bild + Text', 'Vorher/Nachher', 'Zitat'];

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
async function atList(table, params = '') {
  const j = await at('GET', `${table}?${params}`);
  return j.records || [];
}

// ── KI-Compliance-Pruefung ────────────────────────────────────────────
const COMPLIANCE_SYSTEM = `Du bist Compliance-Pruefer fuer oeffentliche Webseiten-Texte von MONAT-Markenpartnerinnen in der SCHWEIZ. Pruefe den Text streng, aber fair, gegen diese Regeln:

1. KEINE Heil-/Krankheits- oder medizinischen Wirkversprechen. Haarpflege ist Kosmetik, kein Heilmittel. Verboten: Aussagen, die Heilung, Therapie oder das Stoppen/Heilen von Haarausfall, Krankheiten oder Beschwerden versprechen (Lebensmittel-/Heilmittel-/Kosmetikrecht).
2. KEINE Einkommens- oder Verdienstversprechen / Garantien ("schnell reich", "passives Einkommen sicher", konkrete Verdienstzusagen).
3. KEINE irrefuehrenden Superlative oder unbelegten Wirkbehauptungen ("klinisch bewiesen heilt", "100% Garantie", "wirkt bei jedem").
4. Kein Schneeball-/Pyramiden-Eindruck (Fokus auf Anwerben statt Produkt).
5. Echte Erfahrungsberichte und Produktbeschreibungen sind erlaubt, solange sie keine Heil-/Verdienstversprechen sind.

Antworte AUSSCHLIESSLICH mit JSON, ohne Markdown:
{"status":"OK"} wenn alles sauber,
oder {"status":"Warnung","probleme":[{"satz":"<wortlaut>","grund":"<kurz>","vorschlag":"<sauberere Formulierung>"}]}`;

async function pruefe(text) {
  if (!text.trim()) return { status: 'OK', notiz: '' };
  if (!ANTHROPIC_KEY) return { status: 'Ungeprüft', notiz: 'KI-Pruefung nicht konfiguriert (ANTHROPIC_API_KEY fehlt).' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system: COMPLIANCE_SYSTEM, messages: [{ role: 'user', content: text }] }),
    });
    if (!res.ok) return { status: 'Ungeprüft', notiz: `KI-Pruefung nicht erreichbar (${res.status}).` };
    const data = await res.json();
    let raw = (data.content && data.content[0] && data.content[0].text || '').trim();
    raw = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed.status === 'OK') return { status: 'OK', notiz: 'Keine Beanstandungen.' };
    const lines = (parsed.probleme || []).map(p => `• "${p.satz}" — ${p.grund}${p.vorschlag ? ` (besser: ${p.vorschlag})` : ''}`);
    return { status: 'Warnung', notiz: lines.join('\n') || 'Bitte Formulierungen pruefen.' };
  } catch (e) {
    return { status: 'Ungeprüft', notiz: 'KI-Pruefung fehlgeschlagen — bitte spaeter erneut speichern.' };
  }
}

// ── optionale Benachrichtigung (Resend) ───────────────────────────────
async function notify(partner, status, notiz) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const to = partner.fields['Verantwortlich E-Mail'] || process.env.MICHAELA_EMAIL || 'info@haar-analyse.ch';
  const from = process.env.RESEND_FROM || 'Haar-Analyse <hallo@haar-analyse.ch>';
  const name = partner.fields['Anzeigename'] || partner.fields['Vorname'] || partner.fields['Slug'];
  const subject = status === 'Warnung'
    ? `⚠️ Landingpage von ${name} braucht Pruefung`
    : `Landingpage von ${name} aktualisiert (Compliance OK)`;
  const body = `${name} hat ihre Landingpage gespeichert.\n\nCompliance-Status: ${status}\n\n${notiz || ''}\n\nIn Airtable pruefen und ggf. LP-Status auf "Freigegeben" setzen.`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
  } catch (_) { /* Benachrichtigung ist best-effort */ }
}

// ── Handler ───────────────────────────────────────────────────────────
export const handler = async (event, context) => {
  if (!TOKEN) return json(500, { error: 'AIRTABLE_TOKEN fehlt' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST.' });
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.email) return json(401, { error: 'Nicht eingeloggt.' });
  const email = String(user.email).toLowerCase().replace(/'/g, '');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Ungueltige Daten.' }); }
  const pIn = payload.partner || {};
  const sektIn = Array.isArray(payload.sektionen) ? payload.sektionen : [];

  try {
    // Eigenen Datensatz serverseitig holen (recordId NIE vom Client uebernehmen).
    const recs = await atList(T_PARTNER, `maxRecords=1&filterByFormula=${enc(`LOWER({E-Mail})='${email}'`)}`);
    const partner = recs[0];
    if (!partner) return json(404, { error: `Kein Partner-Konto fuer ${email}.` });
    const partnerId = partner.id;
    const existingSektIds = new Set(partner.fields['Sektionen'] || []);

    // Texte fuer die Compliance-Pruefung zusammenfuehren.
    const pruefText = [
      pIn['Intro'], pIn['Über mich'],
      ...sektIn.map(s => `${s['Titel'] || ''}\n${s['Text'] || ''}`),
    ].filter(Boolean).join('\n\n');
    const { status, notiz } = await pruefe(pruefText);

    // Partner-Felder schreiben (LP-Status NICHT auf Freigegeben — nur Entwurf, falls leer).
    const fields = {
      'Anzeigename': pIn['Anzeigename'] || '',
      'Rolle': pIn['Rolle'] || '',
      'Intro': pIn['Intro'] || '',
      'Über mich': pIn['Über mich'] || '',
      'Instagram': pIn['Instagram'] || '',
      'Compliance-Status': status,
      'Compliance-Notiz': notiz,
    };
    const curLp = (partner.fields['LP-Status'] && partner.fields['LP-Status'].name) || partner.fields['LP-Status'];
    if (!curLp) fields['LP-Status'] = 'Entwurf';
    await at('PATCH', `${T_PARTNER}/${partnerId}`, { fields, typecast: true });

    // Sektionen synchronisieren (nur eigene).
    const keepIds = new Set();
    let order = 0;
    for (const s of sektIn) {
      order += 1;
      const typ = TYPEN.includes(s['Typ']) ? s['Typ'] : 'Text + Button';
      const sf = {
        'Sektion': `${partner.fields['Slug'] || 'partner'} #${order}`,
        'Partner': [partnerId],
        'Reihenfolge': order,
        'Typ': typ,
        'Titel': s['Titel'] || '',
        'Text': s['Text'] || '',
        'Button-Label': s['Button-Label'] || '',
        'Button-Link': s['Button-Link'] || '',
        'Aktiv': s['Aktiv'] !== false,
      };
      if (s.id && existingSektIds.has(s.id)) {
        await at('PATCH', `${T_SEKT}/${s.id}`, { fields: sf, typecast: true });
        keepIds.add(s.id);
      } else {
        const created = await at('POST', `${T_SEKT}`, { records: [{ fields: sf }], typecast: true });
        if (created.records && created.records[0]) keepIds.add(created.records[0].id);
      }
    }
    // Entfernte eigene Sektionen loeschen.
    const toDelete = [...existingSektIds].filter(id => !keepIds.has(id));
    for (const id of toDelete) {
      await at('DELETE', `${T_SEKT}/${id}`);
    }

    await notify(partner, status, notiz);

    return json(200, { ok: true, compliance: { status, notiz }, slug: partner.fields['Slug'] || '' });
  } catch (err) {
    return json(502, { error: 'Speichern fehlgeschlagen. Bitte spaeter erneut versuchen.' });
  }
};
