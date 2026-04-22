/**
 * Netlify Function — Haarquiz Submit
 *
 * Nimmt Quiz-Antworten + E-Mail entgegen und schickt via Resend zwei E-Mails:
 *  1. An die Kundin: Bestätigung mit Instagram-CTA (Fotos bitte)
 *  2. An Michaela:   strukturierte Lead-Zusammenfassung
 *
 * Environment Variables (im Netlify-Dashboard zu setzen):
 *  - RESEND_API_KEY    — API-Key aus dem Resend-Dashboard
 *  - RESEND_FROM       — Absender-Adresse, z.B. "Michaela <hallo@haarquiz.ch>"
 *  - MICHAELA_EMAIL    — wohin Lead-Mails gehen, z.B. "info@haarquiz.ch"
 *
 * Endpoint: POST /api/submit-quiz
 */

// ── Labels-Mapping (muss mit Quiz-JS übereinstimmen) ──────────────────
const LABELS = {
  q1: { glatt: 'Glatt', wellig: 'Wellig', locken: 'Locken', krause: 'Krause' },
  q2: {
    fein: 'Fein / Dünn',
    normal: 'Normal / Mittel',
    dick: 'Dick / Kräftig',
    haarausfall: 'Haarausfall',
  },
  q3: {
    nein: 'Unauffällig',
    trocken: 'Trocken / Schuppig',
    fettend: 'Schnell fettend',
    empfindlich: 'Empfindlich / Juckend',
  },
  q4: {
    farbe: 'Farbe / Blondierung',
    hitze: 'Hitze-Styling',
    beides: 'Beides (Farbe + Hitze)',
    nein: 'Natürlich (weder noch)',
  },
  q5: {
    'reparatur': 'Reparatur',
    'gesunde-kopfhaut': 'Gesunde Kopfhaut',
    'anti-frizz': 'Anti Frizz',
    'mehr-glanz': 'Mehr Glanz',
    'mehr-volumen': 'Mehr Volumen',
    'schoene-locken': 'Schöne Locken',
    'ciao-schuppen': 'Ciao Schuppen',
    'haarwachstum': 'Haarwachstum',
  },
};

const QUESTIONS = {
  q1: 'Haarstruktur',
  q2: 'Haartyp',
  q3: 'Kopfhaut',
  q4: 'Alltag',
  q5: 'Wünsche',
};

// ── Helpers ──────────────────────────────────────────────────────────
function formatLabels(ids, dict) {
  if (!Array.isArray(ids) || ids.length === 0) return '—';
  const labels = ids.map((id) => dict[id]).filter(Boolean);
  if (labels.length === 0) return '—';
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(', ') + ' und ' + labels[labels.length - 1];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function validate(data) {
  if (!data || typeof data !== 'object') return 'Fehlerhafte Anfrage.';
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  }
  if (!data.answers || typeof data.answers !== 'object') {
    return 'Quiz-Antworten fehlen.';
  }
  return null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── E-Mail Templates ─────────────────────────────────────────────────
function customerHtml({ name }) {
  const greeting = name ? `Hallo ${escapeHtml(name)}` : 'Hallo';
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Dein Haar-Profil</title></head>
<body style="margin:0;padding:0;background:#f8faf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2d342c;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="background:#ffffff;border-radius:20px;padding:40px 36px;box-shadow:0 4px 24px rgba(45,52,44,0.04);">
      <h1 style="font-size:28px;font-weight:600;margin:0 0 16px;letter-spacing:-0.02em;color:#2d342c;">${greeting}</h1>
      <p style="font-size:15px;line-height:1.7;color:#2d342c;margin:0 0 16px;">
        Danke, dass du dir zwei Minuten für dich genommen hast. Deine Antworten sind bei Michaela angekommen — sie schaut sich dein Haar-Profil persönlich an und meldet sich in den nächsten Tagen mit ihrer ehrlichen Empfehlung.
      </p>
      <div style="background:#a8f0e7;padding:20px 24px;border-radius:16px;margin:24px 0;font-size:14px;line-height:1.65;color:#2d342c;">
        <strong style="display:block;margin-bottom:6px;color:#0f4d47;">Ein kleiner Tipp für eine noch bessere Empfehlung</strong>
        Schick Michaela zusätzlich 2–3 Fotos deiner Haare per Instagram-DM — einmal gesamt, einmal Kopfhaut, einmal Spitzen. Viele schätzen den eigenen Haarzustand anders ein als er tatsächlich ist. Fotos helfen ihr, dich präzise zu beraten.
      </div>
      <p style="margin:16px 0;">
        <a href="https://www.instagram.com/made_by_michaela" style="display:inline-block;background:linear-gradient(135deg,#1d6a63 0%,#0f4d47 100%);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:14px;">Fotos an @made_by_michaela senden</a>
      </p>
      <p style="font-size:15px;line-height:1.7;color:#2d342c;margin:24px 0 16px;">
        Die Empfehlung kommt als persönliche Sprachnachricht. Kein Verkaufsgespräch, sondern ehrliche Einschätzung von jemandem, der sich wirklich mit Haaren auskennt. Was du damit machst, ist ganz dir überlassen.
      </p>
      <p style="font-size:13px;color:#55605a;margin:32px 0 0;padding-top:24px;border-top:1px solid rgba(45,52,44,0.08);">
        Du kannst diese E-Mail einfach beantworten, wenn du Fragen hast — sie landet direkt bei Michaela.
      </p>
    </div>
    <div style="text-align:center;padding:24px 20px;font-size:12px;color:#55605a;">
      Michaelas MONAT Academy · <a href="https://haarquiz.ch/impressum.html" style="color:#1d6a63;text-decoration:none;">Impressum</a> · <a href="https://haarquiz.ch/datenschutz.html" style="color:#1d6a63;text-decoration:none;">Datenschutz</a>
    </div>
  </div>
</body></html>`;
}

function customerText({ name }) {
  const greeting = name ? `Hallo ${name}` : 'Hallo';
  return `${greeting},

Danke, dass du dir zwei Minuten für dich genommen hast. Deine Antworten sind bei Michaela angekommen — sie schaut sich dein Haar-Profil persönlich an und meldet sich in den nächsten Tagen mit ihrer ehrlichen Empfehlung.

Ein kleiner Tipp für eine noch bessere Empfehlung: Schick Michaela zusätzlich 2–3 Fotos deiner Haare per Instagram-DM — einmal gesamt, einmal Kopfhaut, einmal Spitzen. Viele schätzen den eigenen Haarzustand anders ein als er tatsächlich ist. Fotos helfen ihr, dich präzise zu beraten.

Instagram: https://www.instagram.com/made_by_michaela

Die Empfehlung kommt als persönliche Sprachnachricht. Kein Verkaufsgespräch, sondern ehrliche Einschätzung von jemandem, der sich wirklich mit Haaren auskennt.

Du kannst diese E-Mail einfach beantworten, wenn du Fragen hast — sie landet direkt bei Michaela.

—
Michaelas MONAT Academy
Impressum: https://haarquiz.ch/impressum.html
Datenschutz: https://haarquiz.ch/datenschutz.html`;
}

function michaelaHtml({ name, email, answers, resultType }) {
  const rows = Object.keys(QUESTIONS)
    .map((q) => {
      const labels = formatLabels(answers[q] || [], LABELS[q]);
      return `<tr>
        <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">${QUESTIONS[q]}</td>
        <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(labels)}</td>
      </tr>`;
    })
    .join('');

  const primaryGoal = LABELS.q5[resultType] || '—';
  const timestamp = new Date().toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Neuer Lead</title></head>
<body style="margin:0;padding:0;background:#f8faf3;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#2d342c;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <div style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 4px 24px rgba(45,52,44,0.04);">
      <h1 style="font-size:22px;font-weight:600;margin:0 0 6px;color:#2d342c;">Neuer Haar-Quiz-Lead</h1>
      <p style="color:#55605a;font-size:13px;margin:0 0 24px;">Eingegangen ${escapeHtml(timestamp)} Uhr · via haarquiz.ch</p>

      <div style="background:#f1f5ec;padding:20px 22px;border-radius:14px;font-size:15px;line-height:1.7;margin-bottom:20px;">
        <strong style="color:#0f4d47;">Name:</strong> ${escapeHtml(name || '—')}<br/>
        <strong style="color:#0f4d47;">E-Mail:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#1d6a63;text-decoration:none;">${escapeHtml(email)}</a>
      </div>

      <div style="background:#a8f0e7;padding:18px 22px;border-radius:14px;margin-bottom:24px;">
        <strong style="display:block;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0f4d47;margin-bottom:4px;">Primäres Ziel</strong>
        <span style="font-size:18px;font-weight:600;color:#2d342c;">${escapeHtml(primaryGoal)}</span>
      </div>

      <table style="width:100%;border-collapse:separate;border-spacing:0 4px;margin-bottom:28px;">${rows}</table>

      <p style="font-size:13px;color:#55605a;margin:0 0 16px;">
        Die Kundin wurde in der Bestätigungs-Mail gebeten, dir per Instagram 2–3 Fotos zu schicken.
      </p>
      <p style="margin:0;">
        <a href="https://www.instagram.com/direct/inbox/" style="display:inline-block;background:linear-gradient(135deg,#1d6a63,#0f4d47);color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:13px;">Instagram-DMs öffnen</a>
      </p>
    </div>
  </div>
</body></html>`;
}

function michaelaText({ name, email, answers, resultType }) {
  const lines = Object.keys(QUESTIONS)
    .map((q) => `${QUESTIONS[q]}: ${formatLabels(answers[q] || [], LABELS[q])}`)
    .join('\n');
  const primaryGoal = LABELS.q5[resultType] || '—';
  const timestamp = new Date().toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `Neuer Haar-Quiz-Lead auf haarquiz.ch
Eingegangen: ${timestamp} Uhr

Name:   ${name || '—'}
E-Mail: ${email}

PRIMÄRES ZIEL: ${primaryGoal}

${lines}

Die Kundin wurde gebeten, dir per Instagram 2-3 Fotos ihrer Haare zu schicken.
Instagram-DMs: https://www.instagram.com/direct/inbox/`;
}

// ── Resend API Call ──────────────────────────────────────────────────
async function sendEmail({ apiKey, from, to, reply_to, subject, html, text }) {
  const body = { from, to, subject, html, text };
  if (reply_to) body.reply_to = reply_to;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Main Handler ─────────────────────────────────────────────────────
export default async (req) => {
  // CORS-Preflight (falls von anderer Domain aufgerufen — hier nicht nötig, aber harmlos)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  // Honeypot — unsichtbares Feld. Wenn Bots es ausfüllen, tun wir so als ob alles OK ist,
  // schicken aber keine Mail. Der Bot merkt nichts.
  if (data.website) {
    return json({ ok: true }, 200);
  }

  const err = validate(data);
  if (err) return json({ ok: false, error: err }, 400);

  const apiKey = process.env.RESEND_API_KEY;
  const FROM = process.env.RESEND_FROM || 'Michaela <hallo@haarquiz.ch>';
  const MICHAELA = process.env.MICHAELA_EMAIL || 'info@haarquiz.ch';

  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return json({ ok: false, error: 'Server-Konfigurationsfehler.' }, 500);
  }

  const { name, email, answers, resultType } = data;

  try {
    // Beide E-Mails parallel — spart ~500ms gegenüber seriell
    await Promise.all([
      sendEmail({
        apiKey,
        from: FROM,
        to: email,
        reply_to: MICHAELA,
        subject: 'Dein Haar-Profil ist angekommen — Michaela meldet sich',
        html: customerHtml({ name }),
        text: customerText({ name }),
      }),
      sendEmail({
        apiKey,
        from: FROM,
        to: MICHAELA,
        reply_to: email,
        subject: `Neuer Lead: ${name || email}`,
        html: michaelaHtml({ name, email, answers, resultType }),
        text: michaelaText({ name, email, answers, resultType }),
      }),
    ]);

    return json({ ok: true }, 200);
  } catch (e) {
    console.error('Email send failed:', e?.message || e);
    return json(
      { ok: false, error: 'E-Mail-Versand fehlgeschlagen. Bitte später erneut versuchen.' },
      500
    );
  }
};

export const config = { path: '/api/submit-quiz' };
