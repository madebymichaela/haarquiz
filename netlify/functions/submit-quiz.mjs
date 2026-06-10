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

// ── Partner-Verzeichnis (Stufe 0) ────────────────────────────────────
// Mehr-Partner-Funnel: jeder Partner hat einen Slug aus der URL /team/{slug}/analyse.
// Pro Partner: Anzeigename, echte Lead-E-Mail, WhatsApp-Nummer, Absender-Local-Part.
//
// Stufe 1 (spaeter): diese Map wird durch die Airtable-Tabelle "Partner" ersetzt,
// damit Michaela neue Partner selbst erfassen kann — ohne Code anzufassen.
const PARTNERS = {
  'marianne-schaad': {
    name:  'Marianne Schaad',
    email: 'schaadmarianne@hotmail.com',
    wa:    '41795738616',
    from:  'marianne-schaad', // ergibt Absender marianne-schaad@haar-analyse.ch
  },
};

// Default-/Fallback-Partner = Michaela (nackte Domain oder unbekannter Slug).
// Verhaelt sich exakt wie bisher: Absender + Reply-To + Lead-Empfaenger aus den Env-Vars.
function resolvePartner(slug) {
  const p = slug && typeof slug === 'string' ? PARTNERS[slug.trim().toLowerCase()] : null;
  if (p) {
    return {
      slug:      slug.trim().toLowerCase(),
      isDefault: false,
      name:      p.name,
      first:     p.name.split(' ')[0],
      email:     p.email,
      wa:        p.wa,
      from:      `${p.name} <${p.from}@haar-analyse.ch>`,
    };
  }
  // Michaela (Default) — byte-identisch zum bisherigen Verhalten
  return {
    slug:      'michaela',
    isDefault: true,
    name:      'Michaela',
    first:     'Michaela',
    email:     process.env.MICHAELA_EMAIL || 'info@haar-analyse.ch',
    wa:        '41767587551',
    from:      process.env.RESEND_FROM || 'Michaela <hallo@haar-analyse.ch>',
  };
}

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
function buildWaLink(partner, name, email, labels, allergien, waschen, monatInteresse, alter, kinder) {
  const msg =
    'Hallo ' + partner.first + '!\n\n' +
    'Ich habe gerade die Haar-Analyse gemacht und möchte mein Ergebnis mit dir besprechen.\n\n' +
    'Name: ' + (name || '—') + '\n' +
    'E-Mail: ' + (email || '—') + '\n' +
    'Alter: ' + (alter || '—') + '\n' +
    'Kinder: ' + (kinder || '—') + '\n' +
    'Struktur: ' + (labels.struktur || '—') + '\n' +
    'Haartyp: ' + (labels.typ || '—') + '\n' +
    'Kopfhaut: ' + (labels.kopfhaut || '—') + '\n' +
    'Hauptziel: ' + (labels.ziel || '—') + '\n' +
    'Allergien / Unverträglichkeiten: ' + (allergien || '—') + '\n' +
    'Waschen: ' + (waschen || '—') + '\n' +
    'MONAT-Interesse: ' + (monatInteresse || '—') + '\n\n' +
    'Ich freue mich auf deine persönliche Empfehlung.\n\n' +
    'Hier noch einige Bilder von meinen Haaren und meiner Kopfhaut.';
  return 'https://wa.me/' + partner.wa + '?text=' + encodeURIComponent(msg);
}

function customerHtml({ partner, name, email, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }) {
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
          ${escapeHtml(partner.first)} berücksichtigt alle deine Wünsche in ihrer Sprachnachricht.
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
      ${alter ? `<tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Alter</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(alter)}</div>
        </td>
      </tr>` : ''}
      ${kinder ? `<tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Kinder</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(kinder)}</div>
        </td>
      </tr>` : ''}
      ${allergien ? `<tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Allergien / Unverträglichkeiten</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(allergien)}</div>
        </td>
      </tr>` : ''}
      ${waschen ? `<tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">Waschen</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(waschen)}</div>
        </td>
      </tr>` : ''}
      ${monatInteresse ? `<tr>
        <td style="padding:14px 16px;background:#f1f5ec;border-radius:12px;font-size:13px;line-height:1.5;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:4px;">MONAT-Interesse</div>
          <div style="font-size:15px;font-weight:600;color:#2d342c;">${escapeHtml(monatInteresse)}</div>
        </td>
      </tr>` : ''}
    </table>`;

  const title = r.title ? String(r.title).replace(/\n/g, ' ') : '';
  const badge = r.badge || '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Dein Haar-Profil</title>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<style>:root{color-scheme:light;} body{background-color:#f8faf3 !important;color:#2d342c !important;}</style>
</head>
<body style="margin:0;padding:0;background:#f8faf3 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2d342c !important;">
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

    <!-- MONAT System Erklärung -->
    <div style="background-color:#ffffff !important;border-radius:20px;padding:36px 32px;margin-bottom:20px;box-shadow:0 4px 24px rgba(45,52,44,0.04);">
      <p style="font-size:15px;line-height:1.8;color:#2d342c !important;margin:0 0 20px;">
        Vielen Dank, dass du dir die Zeit genommen hast. Ich freue mich, dich begleiten zu dürfen — und dich dabei zu unterstützen, wieder zu gesunden, schönen Haaren zu kommen.
      </p>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63 !important;font-weight:700;margin-bottom:8px;">Das MONAT-Pflegesystem</div>
      <p style="font-size:15px;line-height:1.8;color:#2d342c !important;margin:0 0 14px;">
        MONAT ist kein einzelnes Shampoo, das alles regelt. Es ist ein ganzheitliches System, das wie Bausteine funktioniert — aufeinander aufgebaut, je nach deinem Haarbedürfnis individuell einsetzbar.
      </p>
      <p style="font-size:15px;line-height:1.8;color:#2d342c !important;margin:0;">
        Der Ausgangspunkt ist immer die Kopfhaut. Denn nur eine gesunde Kopfhaut kann gesunde, starke Haare wachsen lassen — wie ein gesunder Boden, aus dem gute Pflanzen wachsen.
      </p>
    </div>

    <!-- WhatsApp CTA -->
    <div style="background-color:#ffffff !important;border-radius:20px;padding:36px 32px;margin-bottom:20px;text-align:center;border:2px solid #dee5d8;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63 !important;font-weight:700;margin-bottom:12px;">Dein nächster Schritt</div>
      <h3 style="font-size:20px;font-weight:700;margin:0 0 14px;color:#1a1a1a !important;line-height:1.35;">Schicke mir ein Foto — sofern du das noch nicht gemacht hast.</h3>
      <p style="font-size:15px;line-height:1.7;color:#444444 !important;margin:0 0 28px;">
        Damit ich dir eine wirklich individuelle Beratung geben kann, brauche ich noch ein Foto deiner Haare — auch ohne Gesicht oder verdeckt, einfach von der Haarstruktur. Deine ausgefüllten Angaben werden automatisch mitgesendet.
      </p>
      <a href="${buildWaLink(partner, name, email, lab, allergien, waschen, monatInteresse, alter, kinder)}" style="display:inline-block;background-color:#25D366 !important;color:#ffffff !important;text-decoration:none;padding:16px 36px;border-radius:999px;font-weight:700;font-size:16px;-webkit-text-fill-color:#ffffff;">Jetzt per WhatsApp schreiben</a>
    </div>

    <!-- Was als Nächstes passiert -->
    <div style="background-color:#ffffff !important;border-radius:20px;padding:36px 32px;margin-bottom:20px;box-shadow:0 4px 24px rgba(45,52,44,0.04);">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63 !important;font-weight:700;margin-bottom:16px;">Was als Nächstes passiert</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;padding-bottom:16px;">
            <div style="display:inline-block;background:#1d6a63;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;margin-right:12px;vertical-align:middle;">1</div>
            <span style="font-size:15px;color:#2d342c !important;line-height:1.6;vertical-align:middle;">Sobald ich dein Foto erhalten habe, schicke ich dir eine <strong>persönliche Sprachnachricht</strong> mit meiner Einschätzung und Empfehlung.</span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding-bottom:16px;">
            <div style="display:inline-block;background:#1d6a63;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;margin-right:12px;vertical-align:middle;">2</div>
            <span style="font-size:15px;color:#2d342c !important;line-height:1.6;vertical-align:middle;">Bei weiteren Fragen klären wir das gerne <strong>telefonisch</strong> — du wirst Schritt für Schritt begleitet.</span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;">
            <div style="display:inline-block;background:#1d6a63;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;margin-right:12px;vertical-align:middle;">3</div>
            <span style="font-size:15px;color:#2d342c !important;line-height:1.6;vertical-align:middle;">Nach unserer Beratung stelle ich dir die <strong>für dich passenden Produkte im Warenkorb</strong> zusammen — nach Absprache, damit du sie einfach bestellen kannst.</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Abschluss -->
    <p style="font-size:15px;color:#2d342c !important;text-align:center;margin:0 0 8px;padding:0 12px;">
      Ich freue mich auf deine Nachricht.
    </p>
    <p style="font-size:15px;color:#2d342c !important;text-align:center;font-weight:600;margin:0 0 24px;">
      Herzlich, ${escapeHtml(partner.first)}
    </p>

    <!-- Footer -->
    <div style="text-align:center;padding:28px 20px 0;font-size:12px;color:#55605a;">
      MONAT Academy · <a href="https://haar-analyse.ch/impressum.html" style="color:#1d6a63;text-decoration:none;">Impressum</a> · <a href="https://haar-analyse.ch/datenschutz.html" style="color:#1d6a63;text-decoration:none;">Datenschutz</a>
    </div>
  </div>
</body></html>`;
}

function customerText({ partner, name, email, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }) {
  const greeting = name ? `Hallo ${name}` : 'Hallo';
  const r = result || {};
  const lab = labels || {};
  const goals = Array.isArray(multiGoals) ? multiGoals : [];
  const waLink = buildWaLink(partner, name, email, lab, allergien, waschen, monatInteresse, alter, kinder);

  const title = r.title ? String(r.title).replace(/\n/g, ' ') : '';
  const tipsText = Array.isArray(r.tips) && r.tips.length > 0
    ? '\n\n' + r.tips.map(t => `• ${t}`).join('\n')
    : '';
  const multiGoalText = goals.length > 0
    ? `\n\nDEINE WEITEREN WÜNSCHE\nDu hast ausserdem ${goals.length > 1 ? goals.slice(0, -1).join(', ') + ' und ' + goals[goals.length - 1] : goals[0]} genannt. Ich berücksichtige alle deine Wünsche in meiner Sprachnachricht.`
    : '';

  return `${greeting},

Vielen Dank, dass du dir die Zeit genommen hast. Ich freue mich, dich begleiten zu dürfen — und dich dabei zu unterstützen, wieder zu gesunden, schönen Haaren zu kommen.

DEIN HAAR-PROFIL
Alter:         ${alter || '—'}
Kinder:        ${kinder || '—'}
Struktur:      ${lab.struktur || '—'}
Haar-Zustand:  ${lab.typ || '—'}
Kopfhaut:      ${lab.kopfhaut || '—'}
Deine Wünsche: ${lab.ziel || '—'}${allergien ? '\nAllergien:     ' + allergien : ''}${waschen ? '\nWaschen:       ' + waschen : ''}${monatInteresse ? '\nMONAT-Interesse: ' + monatInteresse : ''}

========================================
DAS MONAT-PFLEGESYSTEM
========================================

MONAT ist kein einzelnes Shampoo, das alles regelt. Es ist ein ganzheitliches System, das wie Bausteine funktioniert — aufeinander aufgebaut, je nach deinem Haarbedürfnis individuell einsetzbar.

Der Ausgangspunkt ist immer die Kopfhaut. Denn nur eine gesunde Kopfhaut kann gesunde, starke Haare wachsen lassen — wie ein gesunder Boden, aus dem gute Pflanzen wachsen.

========================================
DEIN NÄCHSTER SCHRITT
========================================

Schicke mir ein Foto — sofern du das noch nicht gemacht hast.

Damit ich dir eine wirklich individuelle Beratung geben kann, brauche ich noch ein Foto deiner Haare — auch ohne Gesicht oder verdeckt, einfach von der Haarstruktur. Deine ausgefüllten Angaben werden automatisch mitgesendet.

WhatsApp: ${waLink}

========================================
WAS ALS NÄCHSTES PASSIERT
========================================

1. Sobald ich dein Foto erhalten habe, schicke ich dir eine persönliche Sprachnachricht mit meiner Einschätzung und Empfehlung.

2. Bei weiteren Fragen klären wir das gerne telefonisch — du wirst Schritt für Schritt begleitet.

3. Nach unserer Beratung stelle ich dir die für dich passenden Produkte im Warenkorb zusammen — nach Absprache, damit du sie einfach bestellen kannst.

Ich freue mich auf deine Nachricht.
Herzlich, ${partner.first}

—
MONAT Academy
Impressum:    https://haar-analyse.ch/impressum.html
Datenschutz:  https://haar-analyse.ch/datenschutz.html`;
}

// Telefonnummer auf internationales Format bringen (Schweiz: 0XX → 41XX, +41XX → 41XX)
function formatPhone(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/[\s\-\(\)\.]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '41' + n.slice(1);
  return n;
}

function michaelaHtml({ name, email, telefon, answers, resultType, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }) {
  const rows = Object.keys(QUESTIONS)
    .map((q) => {
      const lbs = formatLabels(answers[q] || [], LABELS[q]);
      return `<tr>
        <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">${QUESTIONS[q]}</td>
        <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(lbs)}</td>
      </tr>`;
    })
    .join('');

  const primaryGoal = LABELS.q5[resultType] || '—';
  const timestamp = new Date().toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // WhatsApp-Link zur Teilnehmerin (falls Nummer vorhanden)
  const customerPhone = formatPhone(telefon);
  const waMsg = encodeURIComponent(`Hallo ${name || ''}! Ich melde mich bezüglich deiner Haar-Analyse. Ich habe deine Angaben angeschaut und melde mich gleich mit meiner Empfehlung.`);
  const waCustomerLink = customerPhone
    ? `https://wa.me/${customerPhone}?text=${waMsg}`
    : null;

  // Kundinnen-Mail-Vorschau (gleicher Inhalt wie customerHtml)
  const lab = labels || {};
  const goals = Array.isArray(multiGoals) ? multiGoals : [];
  const customerPreview = `
    <div style="background:#f8faf3;border-radius:16px;padding:24px;margin-top:16px;border:2px dashed #c8d5c0;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:700;margin-bottom:12px;">Vorschau — Das hat die Teilnehmerin erhalten</div>

      <!-- Greeting -->
      <div style="background:#ffffff;border-radius:16px;padding:24px 24px 20px;margin-bottom:12px;">
        <h2 style="font-size:20px;font-weight:600;margin:0 0 10px;color:#2d342c;">${name ? `Hallo ${escapeHtml(name)}` : 'Hallo'}</h2>
        <p style="font-size:14px;line-height:1.7;color:#2d342c;margin:0;">Danke, dass du dir zwei Minuten für dich genommen hast. Hier ist deine persönliche Haar-Auswertung — zum Aufheben und in Ruhe nachlesen.</p>
      </div>

      <!-- Insights -->
      <div style="background:#ffffff;border-radius:16px;padding:20px 24px;margin-bottom:12px;">
        <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:600;margin-bottom:6px;">Dein Haar-Profil</div>
        <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#2d342c;">Das hast du genannt</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 6px;">
          <tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">Struktur</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(lab.struktur || '—')}</div></td></tr>
          <tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">Haar-Zustand</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(lab.typ || '—')}</div></td></tr>
          <tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">Kopfhaut</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(lab.kopfhaut || '—')}</div></td></tr>
          <tr><td style="padding:10px 14px;background:#a8f0e7;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#0f4d47;font-weight:600;margin-bottom:3px;">Deine Wünsche</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(lab.ziel || '—')}</div></td></tr>
          ${allergien ? `<tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">Allergien</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(allergien)}</div></td></tr>` : ''}
          ${waschen ? `<tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">Waschen</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(waschen)}</div></td></tr>` : ''}
          ${monatInteresse ? `<tr><td style="padding:10px 14px;background:#f1f5ec;border-radius:10px;"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#55605a;font-weight:600;margin-bottom:3px;">MONAT-Interesse</div><div style="font-size:14px;font-weight:600;color:#2d342c;">${escapeHtml(monatInteresse)}</div></td></tr>` : ''}
        </table>
      </div>

      <!-- MONAT Erklärung -->
      <div style="background:#ffffff;border-radius:16px;padding:20px 24px;margin-bottom:12px;">
        <p style="font-size:14px;line-height:1.8;color:#2d342c;margin:0 0 14px;">Vielen Dank, dass du dir die Zeit genommen hast. Ich freue mich, dich begleiten zu dürfen — und dich dabei zu unterstützen, wieder zu gesunden, schönen Haaren zu kommen.</p>
        <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:700;margin-bottom:6px;">Das MONAT-Pflegesystem</div>
        <p style="font-size:14px;line-height:1.8;color:#2d342c;margin:0 0 10px;">MONAT ist kein einzelnes Shampoo, das alles regelt. Es ist ein ganzheitliches System, das wie Bausteine funktioniert — aufeinander aufgebaut, je nach deinem Haarbedürfnis individuell einsetzbar.</p>
        <p style="font-size:14px;line-height:1.8;color:#2d342c;margin:0;">Der Ausgangspunkt ist immer die Kopfhaut. Denn nur eine gesunde Kopfhaut kann gesunde, starke Haare wachsen lassen — wie ein gesunder Boden, aus dem gute Pflanzen wachsen.</p>
      </div>

      <!-- WA CTA -->
      <div style="background:#ffffff;border-radius:16px;padding:20px 24px;margin-bottom:12px;text-align:center;border:1px solid #dee5d8;">
        <h4 style="font-size:16px;font-weight:700;margin:0 0 10px;color:#1a1a1a;">Schicke mir ein Foto — sofern du das noch nicht gemacht hast.</h4>
        <p style="font-size:13px;line-height:1.7;color:#444;margin:0 0 16px;">Damit ich dir eine wirklich individuelle Beratung geben kann, brauche ich noch ein Foto deiner Haare.</p>
        <span style="display:inline-block;background:#25D366;color:#ffffff;padding:12px 28px;border-radius:999px;font-weight:700;font-size:14px;">Jetzt per WhatsApp schreiben</span>
      </div>

      <!-- Nächste Schritte -->
      <div style="background:#ffffff;border-radius:16px;padding:20px 24px;">
        <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#1d6a63;font-weight:700;margin-bottom:12px;">Was als Nächstes passiert</div>
        <p style="font-size:13px;line-height:1.7;color:#2d342c;margin:0 0 8px;"><strong>1.</strong> Sobald ich dein Foto erhalten habe, schicke ich dir eine <strong>persönliche Sprachnachricht</strong>.</p>
        <p style="font-size:13px;line-height:1.7;color:#2d342c;margin:0 0 8px;"><strong>2.</strong> Bei weiteren Fragen klären wir das gerne <strong>telefonisch</strong>.</p>
        <p style="font-size:13px;line-height:1.7;color:#2d342c;margin:0;"><strong>3.</strong> Nach unserer Beratung stelle ich dir die <strong>passenden Produkte im Warenkorb</strong> zusammen.</p>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Neuer Lead</title></head>
<body style="margin:0;padding:0;background:#f8faf3;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#2d342c;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <div style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 4px 24px rgba(45,52,44,0.04);">
      <h1 style="font-size:22px;font-weight:600;margin:0 0 6px;color:#2d342c;">Neuer Haar-Quiz-Lead</h1>
      <p style="color:#55605a;font-size:13px;margin:0 0 24px;">Eingegangen ${escapeHtml(timestamp)} Uhr · via haar-analyse.ch</p>

      <div style="background:#f1f5ec;padding:20px 22px;border-radius:14px;font-size:15px;line-height:1.7;margin-bottom:20px;">
        <strong style="color:#0f4d47;">Name:</strong> ${escapeHtml(name || '—')}<br/>
        <strong style="color:#0f4d47;">E-Mail:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#1d6a63;text-decoration:none;">${escapeHtml(email)}</a><br/>
        ${telefon ? `<strong style="color:#0f4d47;">Telefon:</strong> ${escapeHtml(telefon)}` : ''}
      </div>

      <div style="background:#a8f0e7;padding:18px 22px;border-radius:14px;margin-bottom:24px;">
        <strong style="display:block;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0f4d47;margin-bottom:4px;">Primäres Ziel</strong>
        <span style="font-size:18px;font-weight:600;color:#2d342c;">${escapeHtml(primaryGoal)}</span>
      </div>

      <table style="width:100%;border-collapse:separate;border-spacing:0 4px;margin-bottom:28px;">${rows}</table>

      ${alter || kinder || allergien || waschen || monatInteresse ? `<table style="width:100%;border-collapse:separate;border-spacing:0 4px;margin-bottom:28px;">
        ${alter ? `<tr>
          <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">Alter</td>
          <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(alter)}</td>
        </tr>` : ''}
        ${kinder ? `<tr>
          <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">Kinder</td>
          <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(kinder)}</td>
        </tr>` : ''}
        ${allergien ? `<tr>
          <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">Allergien</td>
          <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(allergien)}</td>
        </tr>` : ''}
        ${waschen ? `<tr>
          <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">Waschen</td>
          <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(waschen)}</td>
        </tr>` : ''}
        ${monatInteresse ? `<tr>
          <td style="padding:12px 16px;background:#f1f5ec;font-weight:600;font-size:11px;color:#55605a;letter-spacing:2px;text-transform:uppercase;width:140px;vertical-align:top;">MONAT-Interesse</td>
          <td style="padding:12px 16px;background:#ffffff;font-size:15px;color:#2d342c;vertical-align:top;">${escapeHtml(monatInteresse)}</td>
        </tr>` : ''}
      </table>` : ''}

      <p style="font-size:13px;color:#55605a;margin:0 0 16px;">
        Die Teilnehmerin wurde gebeten, dir per WhatsApp zu schreiben und ein Foto ihrer Haare hinzuzufügen.
      </p>
      <p style="margin:0;">
        ${waCustomerLink
          ? `<a href="${waCustomerLink}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:13px;-webkit-text-fill-color:#ffffff;">WhatsApp öffnen (${escapeHtml(telefon)})</a>`
          : `<span style="font-size:13px;color:#55605a;">Keine Telefonnummer angegeben</span>`
        }
      </p>
    </div>

    ${customerPreview}
  </div>
</body></html>`;
}

function michaelaText({ partner, name, email, telefon, answers, resultType, result, allergien, waschen, monatInteresse, alter, kinder }) {
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

Name:    ${name || '—'}
E-Mail:  ${email}
Telefon: ${telefon || '—'}
Alter:   ${alter || '—'}
Kinder:  ${kinder || '—'}

PRIMÄRES ZIEL: ${primaryGoal}

${lines}${allergien ? '\nAllergien:        ' + allergien : ''}${waschen ? '\nWaschen:          ' + waschen : ''}${monatInteresse ? '\nMONAT-Interesse:  ' + monatInteresse : ''}

Die Kundin wurde gebeten, dir per WhatsApp zu schreiben und 2-3 Fotos ihrer Haare hinzuzufügen.
WhatsApp: https://wa.me/${partner?.wa || '41767587551'}${resultBlock}`;
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
function buildAirtableFields({ partner, name, email, telefon, answers, resultType, allergien, waschen, monatInteresse, alter, kinder }) {
  const mapMulti = (ids, dict) =>
    (ids || []).map((id) => dict[id]).filter(Boolean);

  const fields = {
    Name: name || '',
    Partner: partner?.name || 'Michaela',
    Email: email,
    Telefon: telefon || '',
    'Primäres Ziel': LABELS.q5[resultType] || null,
    Struktur: mapMulti(answers.q1, LABELS.q1),
    Haartyp: mapMulti(answers.q2, LABELS.q2),
    Kopfhaut: mapMulti(answers.q3, LABELS.q3),
    Alltag: mapMulti(answers.q4, LABELS.q4),
    'Alle Wünsche': mapMulti(answers.q5, LABELS.q5),
    Alter: alter || '',
    Kinder: kinder || '',
    Waschen: waschen || '',
    Allergien: allergien || '',
    'MONAT Interesse': monatInteresse || '',
    Status: 'Neu',
  };

  // Leere Strings entfernen, damit Airtable keine leeren Felder erstellt
  Object.keys(fields).forEach((k) => {
    if (fields[k] === '') delete fields[k];
  });

  return fields;
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
  const OWNER = process.env.OWNER_EMAIL || null;

  // Partner aus dem Slug aufloesen (Default = Michaela, byte-identisch zu frueher).
  const partner = resolvePartner(data.partner);

  // Absender pro Partner. Domain bleibt fix haar-analyse.ch (bei Resend verifiziert) —
  // variabel sind nur Anzeigename und lokaler Teil der Adresse.
  const FROM = partner.from;

  // Lead-Empfänger: der jeweilige Partner, plus Owner (Georgios) wenn konfiguriert.
  const leadRecipients = OWNER ? [partner.email, OWNER] : partner.email;

  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return json({ ok: false, error: 'Server-Konfigurationsfehler.' }, 500);
  }

  const { name, email, telefon, answers, resultType, result, labels, multiGoals, allergien, waschen, monatInteresse: rawMonatInteresse, monatSonstiges, alter, kinder } = data;
  // MONAT-Interesse: Komma-getrennte Auswahl + optional Freitext
  const monatInteresse = rawMonatInteresse
    ? rawMonatInteresse + (monatSonstiges ? ` (${monatSonstiges})` : '')
    : '';

  // Tasks zusammenstellen — E-Mails sind Pflicht, Airtable ist optional
  const tasks = [
    sendEmail({
      apiKey,
      from: FROM,
      to: email,
      reply_to: partner.email,
      subject: 'Deine Haar-Auswertung — und was jetzt kommt',
      html: customerHtml({ partner, name, email, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }),
      text: customerText({ partner, name, email, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }),
    }),
    sendEmail({
      apiKey,
      from: FROM,
      to: leadRecipients,
      reply_to: email,
      subject: `Neuer Lead: ${name || email}`,
      html: michaelaHtml({ partner, name, email, telefon, answers, resultType, result, labels, multiGoals, allergien, waschen, monatInteresse, alter, kinder }),
      text: michaelaText({ partner, name, email, telefon, answers, resultType, result, allergien, waschen, monatInteresse, alter, kinder }),
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
        fields: buildAirtableFields({ partner, name, email, telefon, answers, resultType, allergien, waschen, monatInteresse, alter, kinder }),
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
