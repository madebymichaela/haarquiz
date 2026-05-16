/**
 * Netlify Function — Haarquiz Submit
 *
 * Nimmt Quiz-Antworten + E-Mail entgegen und schickt via Resend zwei E-Mails:
 *  1. An die Kundin: Bestätigung mit Instagram-CTA (Fotos bitte)
 *  2. An Michaela:   strukturierte Lead-Zusammenfassung
 *
 * Environment Variables (im Netlify-Dashboard zu setzen):
 *  - RESEND_API_KEY    — API-Key aus dem Resend-Dashboard
 *  - RESEND_FROM       — Absender-Adresse, z.B. "Michaela <hallo@haar-analyse.ch>"
 *  - MICHAELA_EMAIL    — wohin Lead-Mails gehen, z.B. "info@haar-analyse.ch"
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
    bruechig: 'Brüchig',
    geschaedigt: 'Geschädigt',
    blondiert: 'Blondiert',
    spliss: 'Spliss',
    trocken: 'Trocken',
    platt: 'Platt',
  },
  q3: {
    nein: 'Unauffällig',
    trocken: 'Trocken',
    schuppig: 'Schuppig',
    fettend: 'Schnell fettend',
    empfindlich: 'Empfindlich',
    juckend: 'Juckend',
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
    'mehr-glanz': 'Mehr Glanz & Feuchtigkeit',
    'mehr-volumen': 'Mehr Volumen',
    'dichteres-haar': 'Dichteres Haar',
    'haarwachstum': 'Haarwachstum',
    'schoene-locken': 'Schöne Locken',
    'glattere-haare': 'Glattere Haare',
    'ciao-schuppen': 'Ciao Schuppen',
    'weniger-oelige': 'Weniger ölige Haare',
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
function customerHtml({ name, result, labels, multiGoals }) {
  const greeting = name ? `Hallo ${escapeHtml(name)}` : 'Hallo';
  const r = result || {};
  const lab = labels || {};
  const goals = Array.isArray(multiGoals) ? multiGoals : [];

  // Tips-Liste als HTML
  const tipsList = Array.isArray(r.tips) && r.tips.length > 0
    ? `<ul style="margin:16px 0 0;padding:0 0 0 20px;list-style:none;">` +
      r.tips.map(t => `<li style="position:relative;padding:8px 0 8px 16px;font-size:14px;line-height:1.65;color:#2d342c;">
        <span style="position:absolute;left:-4px;top:17px;width:6px;height:6px;background:#1d6a63;border-radius:50%;"></span>
        ${escapeHtml(t)}
      </li>`).join('') +
      `</ul>`
    : '';

  // Multi-Goal-Note (nur wenn mehrere Ziele gewählt)
  const multiGoalNote = goals.length > 0
    ? `<div style="background:#ffffff;border-left:4px solid #1d6a63;border-radius:14px;padding:20px 24px;margin:20px 0;box-shadow:0 2px 12px rgba(45,52,44,0.03);">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#1d6a63;font-weight:600;margin-bottom:8px;">Deine weiteren Wünsche</div>
        <p style="font-size:14px;line-height:1.7;color:#2d342c;margin:0;">
          Du hast ausserdem <strong style="color:#0f4d47;">${escapeHtml(goals.length > 1
            ? goals.slice(0, -1).join(', ') + ' und ' + goals[goals.length - 1]
            : goals[0])}</strong> genannt.
          Das ist häufig — dein Haar ist vielschichtig, und deine Empfehlung soll es auch sein.
          Michaela berücksichtigt alle deine Wünsche in ihrer Sprachnachricht.
        </p>
      </div>`
    : '';

  // Insights-Cards (Quiz-Zusammenfassung)
  const insightsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:separate;border-spacing:0 8px;">
      <tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Struktur</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(lab.struktur || '—')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Haar-Zustand</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(lab.typ || '—')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Kopfhaut</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(lab.kopfhaut || '—')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:#a8f0e7;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#0f4d47;font-weight:600;margin-bottom:4px;">Deine Wünsche</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(lab.ziel || '—')}</div>
        </td>
      </tr>
    </table>`;

  const title = r.title ? String(r.title).replace(/\n/g, ' ') : '';
  const badge = r.badge || '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Dein Haar-Profil</title></head>
<body style="margin:0;padding:0;background:#f8faf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2d342c;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Greeting -->
    <div style="background:#ffffff;border-radius:20px;padding:36px 32px 28px;box-shadow:0 4px 24px rgba(45,52,44,0.04);margin-bottom:20px;">
      <h1 style="font-size:28px;font-weight:600;margin:0 0 14px;letter-spacing:-0.02em;color:#2d342c;">${greeting}</h1>
      <p style="font-size:15px;line-height:1.7;color:#2d342c;margin:0;">
        Danke, dass du dir zwei Minuten für dich genommen hast. Hier ist deine persönliche Haar-Auswertung — zum Aufheben und in Ruhe nachlesen.
      </p>
    </div>

    <!-- Insights (Quiz-Antworten) -->
    <div style="background:#ffffff;border-radius:20px;padding:28px 32px;box-shadow:0 4px 24px rgba(45,52,44,0.04);margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:600;margin-bottom:8px;">Dein Haar-Profil</div>
      <h2 style="font-size:22px;font-weight:600;margin:0 0 4px;letter-spacing:-0.015em;color:#2d342c;">Das hast du genannt</h2>
      ${insightsHtml}
    </div>

    <!-- PROMINENTER CTA: Dein nächster Schritt -->
    <div style="background:linear-gradient(135deg,#1d6a63 0%,#0f4d47 100%);border-radius:20px;padding:36px 32px;margin-bottom:20px;text-align:center;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#a8f0e7;font-weight:600;margin-bottom:12px;">Dein nächster Schritt</div>
      <h3 style="font-size:24px;font-weight:600;margin:0 0 14px;letter-spacing:-0.02em;color:#ffffff;line-height:1.25;">Die persönliche Empfehlung kommt als Sprachnachricht.</h3>
      <p style="font-size:15px;line-height:1.7;color:#ffffff;opacity:0.92;margin:0 0 24px;">
        Dafür brauchst du nur zwei Minuten: Schick Michaela <strong>dein Haar-Profil als Bild oder Screenshot</strong> plus <strong>2–3 Fotos deiner Haare</strong> (gesamt, Kopfhaut, Spitzen) per Instagram-DM.
        <br/><br/>
        Viele schätzen den eigenen Haarzustand anders ein als er tatsächlich ist — Fotos helfen Michaela, dich wirklich präzise zu beraten.
      </p>
      <a href="https://www.instagram.com/made_by_michaela" style="display:inline-block;background:#ffffff;color:#1d6a63;text-decoration:none;padding:15px 32px;border-radius:999px;font-weight:600;font-size:15px;">An @made_by_michaela senden</a>
      <p style="font-size:13px;color:#a8f0e7;margin:16px 0 0;opacity:0.85;">
        Ohne diesen Schritt geht's nicht weiter — die Sprachnachricht ist die eigentliche Empfehlung.
      </p>
    </div>

    <!-- Hauptauswertung -->
    <div style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 4px 24px rgba(45,52,44,0.04);margin-bottom:20px;">
      ${badge ? `<div style="display:inline-block;background:#1d6a63;color:#ffffff;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:8px 18px;border-radius:999px;margin-bottom:18px;">${escapeHtml(badge)}</div>` : ''}
      ${title ? `<h2 style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:26px;font-weight:600;margin:0 0 14px;letter-spacing:-0.02em;color:#2d342c;line-height:1.2;">${escapeHtml(title)}</h2>` : ''}
      ${r.tagline ? `<p style="font-size:16px;line-height:1.6;color:#55605a;font-style:italic;margin:0 0 24px;">${escapeHtml(r.tagline)}</p>` : ''}
      ${r.desc ? `<h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#2d342c;">Was das für dich bedeutet</h3><p style="font-size:15px;line-height:1.8;color:#2d342c;margin:0 0 4px;">${escapeHtml(r.desc)}</p>` : ''}
      ${tipsList}
    </div>

    ${multiGoalNote}

    <!-- Produkt-Richtung (kürzer, verweist auf Sprachnachricht) -->
    ${r.product ? `<div style="background:#a8f0e7;border-radius:20px;padding:24px 32px;margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#0f4d47;font-weight:600;margin-bottom:8px;">Produkt-Richtung (allgemein)</div>
      <p style="font-size:14px;line-height:1.65;color:#2d342c;margin:0 0 10px;">${escapeHtml(r.product)}</p>
      <p style="font-size:13px;line-height:1.65;color:#0f4d47;margin:0;font-style:italic;">
        Deine konkrete Empfehlung — welches Produkt in welcher Reihenfolge, angepasst an deine Fotos — hörst du in Michaelas Sprachnachricht.
      </p>
    </div>` : ''}

    <!-- Reply-Hinweis (kurz) -->
    <p style="font-size:13px;color:#55605a;text-align:center;margin:24px 0 0;padding:0 12px;">
      Fragen vorab? Antworte einfach auf diese E-Mail — sie landet direkt bei Michaela.
    </p>

    <!-- Footer -->
    <div style="text-align:center;padding:28px 20px 0;font-size:12px;color:#55605a;">
      Michaelas MONAT Academy · <a href="https://haar-analyse.ch/impressum.html" style="color:#1d6a63;text-decoration:none;">Impressum</a> · <a href="https://haar-analyse.ch/datenschutz.html" style="color:#1d6a63;text-decoration:none;">Datenschutz</a>
    </div>
  </div>
</body></html>`;
}

function customerText({ name, result, labels, multiGoals }) {
  const greeting = name ? `Hallo ${name}` : 'Hallo';
  const r = result || {};
  const lab = labels || {};
  const goals = Array.isArray(multiGoals) ? multiGoals : [];

  const title = r.title ? String(r.title).replace(/\n/g, ' ') : '';
  const tipsText = Array.isArray(r.tips) && r.tips.length > 0
    ? '\n\n' + r.tips.map(t => `• ${t}`).join('\n')
    : '';
  const multiGoalText = goals.length > 0
    ? `\n\nDEINE WEITEREN WÜNSCHE\nDu hast ausserdem ${goals.length > 1 ? goals.slice(0, -1).join(', ') + ' und ' + goals[goals.length - 1] : goals[0]} genannt. Michaela berücksichtigt alle deine Wünsche in ihrer Sprachnachricht.`
    : '';

  return `${greeting},

Danke, dass du dir zwei Minuten für dich genommen hast. Hier ist deine Haar-Auswertung zum Nachlesen und Aufheben.

DEIN HAAR-PROFIL
Struktur:      ${lab.struktur || '—'}
Haar-Zustand:  ${lab.typ || '—'}
Kopfhaut:      ${lab.kopfhaut || '—'}
Deine Wünsche: ${lab.ziel || '—'}

========================================
DEIN NÄCHSTER SCHRITT
Die persönliche Empfehlung kommt als Sprachnachricht.
========================================

Dafür brauchst du nur zwei Minuten: Schick Michaela dein Haar-Profil als Bild oder Screenshot PLUS 2-3 Fotos deiner Haare (gesamt, Kopfhaut, Spitzen) per Instagram-DM.

Viele schätzen den eigenen Haarzustand anders ein als er tatsächlich ist — Fotos helfen Michaela, dich wirklich präzise zu beraten.

👉 Instagram: https://www.instagram.com/made_by_michaela

Ohne diesen Schritt geht's nicht weiter — die Sprachnachricht ist die eigentliche Empfehlung.

========================================

${r.badge ? r.badge.toUpperCase() + '\n' : ''}${title}
${r.tagline ? '\n' + r.tagline : ''}

${r.desc ? 'WAS DAS FÜR DICH BEDEUTET\n' + r.desc : ''}${tipsText}${multiGoalText}

${r.product ? 'PRODUKT-RICHTUNG (ALLGEMEIN)\n' + r.product + '\n\nDeine konkrete Empfehlung — welches Produkt in welcher Reihenfolge, angepasst an deine Fotos — hörst du in Michaelas Sprachnachricht.\n' : ''}
Fragen vorab? Antworte einfach auf diese E-Mail — sie landet direkt bei Michaela.

—
Michaelas MONAT Academy
Impressum:    https://haar-analyse.ch/impressum.html
Datenschutz:  https://haar-analyse.ch/datenschutz.html`;
}

function michaelaHtml({ name, email, answers, resultType, result }) {
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
      <p style="color:#55605a;font-size:13px;margin:0 0 24px;">Eingegangen ${escapeHtml(timestamp)} Uhr · via haar-analyse.ch</p>

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

    <!-- Was der Lead erhalten hat -->
    ${result ? `<div style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 4px 24px rgba(45,52,44,0.04);margin-top:16px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:600;margin-bottom:8px;">Was der Lead erhalten hat</div>
      <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;color:#2d342c;">${escapeHtml(String(result.title || '').replace(/\n/g, ' '))}</h2>
      ${result.tagline ? `<p style="font-size:14px;color:#55605a;font-style:italic;margin:0 0 14px;">${escapeHtml(result.tagline)}</p>` : ''}
      ${result.desc ? `<p style="font-size:14px;line-height:1.7;color:#2d342c;margin:0 0 14px;">${escapeHtml(result.desc)}</p>` : ''}
      ${Array.isArray(result.tips) && result.tips.length > 0 ? `<ul style="margin:0 0 14px;padding-left:18px;">${result.tips.map(t => `<li style="font-size:13px;line-height:1.65;color:#2d342c;margin-bottom:4px;">${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
      ${result.product ? `<div style="background:#f1f5ec;padding:14px 16px;border-radius:10px;font-size:13px;color:#2d342c;line-height:1.6;"><strong style="color:#0f4d47;">Produkt-Richtung:</strong> ${escapeHtml(result.product)}</div>` : ''}
    </div>` : ''}
  </div>
</body></html>`;
}

function michaelaText({ name, email, answers, resultType, result }) {
  const lines = Object.keys(QUESTIONS)
    .map((q) => `${QUESTIONS[q]}: ${formatLabels(answers[q] || [], LABELS[q])}`)
    .join('\n');
  const primaryGoal = LABELS.q5[resultType] || '—';
  const timestamp = new Date().toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const r = result || {};
  const title = r.title ? String(r.title).replace(/\n/g, ' ') : '';
  const resultBlock = result ? `
========================================
WAS DER LEAD ERHALTEN HAT
========================================
${title ? title + '\n' : ''}${r.tagline ? r.tagline + '\n' : ''}
${r.desc || ''}
${Array.isArray(r.tips) && r.tips.length > 0 ? '\n' + r.tips.map(t => `• ${t}`).join('\n') : ''}
${r.product ? '\nProdukt-Richtung: ' + r.product : ''}` : '';

  return `Neuer Haar-Quiz-Lead auf haar-analyse.ch
Eingegangen: ${timestamp} Uhr

Name:   ${name || '—'}
E-Mail: ${email}

PRIMÄRES ZIEL: ${primaryGoal}

${lines}

Die Kundin wurde gebeten, dir per Instagram 2-3 Fotos ihrer Haare zu schicken.
Instagram-DMs: https://www.instagram.com/direct/inbox/${resultBlock}`;
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

// ── Airtable Integration ─────────────────────────────────────────────
/**
 * Baut die Fields für einen Airtable-Record aus den Quiz-Daten.
 * Die Feldnamen müssen EXAKT denen in Airtable entsprechen (case-sensitive).
 * Multiple-Select-Felder erwarten Arrays von Option-Labels.
 */
function buildAirtableFields({ name, email, answers, resultType }) {
  const mapMulti = (ids, dict) =>
    (ids || []).map((id) => dict[id]).filter(Boolean);

  return {
    Name: name || '',
    Email: email,
    'Primäres Ziel': LABELS.q5[resultType] || null,
    Struktur: mapMulti(answers.q1, LABELS.q1),
    Haartyp: mapMulti(answers.q2, LABELS.q2),
    Kopfhaut: mapMulti(answers.q3, LABELS.q3),
    Alltag: mapMulti(answers.q4, LABELS.q4),
    'Alle Wünsche': mapMulti(answers.q5, LABELS.q5),
    Status: 'Neu',
  };
}

/**
 * Schreibt einen neuen Lead-Record in Airtable.
 * `typecast: true` erlaubt Airtable, fehlende Select-Options automatisch anzulegen —
 * macht die Integration robust gegenüber leichten Label-Abweichungen.
 */
async function writeAirtable({ token, baseId, tableId, fields }) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [{ fields }],
      typecast: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Airtable API ${res.status}: ${JSON.stringify(data)}`);
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
  const FROM = process.env.RESEND_FROM || 'Michaela <hallo@haar-analyse.ch>';
  const MICHAELA = process.env.MICHAELA_EMAIL || 'info@haar-analyse.ch';
  const OWNER = process.env.OWNER_EMAIL || null;

  // Lead-Empfänger: Michaela immer, Owner (Georgios) wenn konfiguriert
  const leadRecipients = OWNER ? [MICHAELA, OWNER] : MICHAELA;

  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return json({ ok: false, error: 'Server-Konfigurationsfehler.' }, 500);
  }

  const { name, email, answers, resultType, result, labels, multiGoals } = data;

  // Tasks zusammenstellen — E-Mails sind Pflicht, Airtable ist optional
  const tasks = [
    sendEmail({
      apiKey,
      from: FROM,
      to: email,
      reply_to: MICHAELA,
      subject: 'Deine Haar-Auswertung — und was jetzt kommt',
      html: customerHtml({ name, result, labels, multiGoals }),
      text: customerText({ name, result, labels, multiGoals }),
    }),
    sendEmail({
      apiKey,
      from: FROM,
      to: leadRecipients,
      reply_to: email,
      subject: `Neuer Lead: ${name || email}`,
      html: michaelaHtml({ name, email, answers, resultType, result }),
      text: michaelaText({ name, email, answers, resultType, result }),
    }),
  ];

  // Airtable-Write nur hinzufügen, wenn alle drei Env Vars gesetzt sind
  const airtableToken = process.env.AIRTABLE_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableId = process.env.AIRTABLE_TABLE_ID;
  const airtableConfigured = airtableToken && airtableBaseId && airtableTableId;

  if (airtableConfigured) {
    tasks.push(
      writeAirtable({
        token: airtableToken,
        baseId: airtableBaseId,
        tableId: airtableTableId,
        fields: buildAirtableFields({ name, email, answers, resultType }),
      })
    );
  }

  // Alle Tasks parallel, aber einzelne Fehler brechen nicht alles ab
  const results = await Promise.allSettled(tasks);
  const [mailCustomer, mailMichaela, airtableResult] = results;

  // E-Mails sind kritisch — wenn eine davon scheitert, geben wir einen Fehler zurück
  if (mailCustomer.status === 'rejected' || mailMichaela.status === 'rejected') {
    console.error(
      'Email send failed:',
      mailCustomer.status === 'rejected' ? mailCustomer.reason?.message : '',
      mailMichaela.status === 'rejected' ? mailMichaela.reason?.message : ''
    );
    return json(
      { ok: false, error: 'E-Mail-Versand fehlgeschlagen. Bitte später erneut versuchen.' },
      500
    );
  }

  // Airtable ist optional — nur loggen bei Fehler, User-Flow nicht stören.
  // Michaela merkt es trotzdem, weil die Mail mit Lead-Daten ankommt.
  if (airtableResult?.status === 'rejected') {
    console.warn('Airtable write failed (non-critical):', airtableResult.reason?.message);
  }

  return json({ ok: true }, 200);
};

export const config = { path: '/api/submit-quiz' };
