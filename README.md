# haarquiz.ch

Haar-Quiz und Lead-Magnet für **Michaelas MONAT Academy**.

Eine Single-Page-Website mit 5 Fragen, die einer Kundin in 2 Minuten eine persönliche Produktempfehlung generiert — inklusive Impressum, Datenschutzerklärung und Download-Funktion für ein Haar-Profil als Bild.

## Live

- Production: [haarquiz.ch](https://haarquiz.ch)
- Hosting: [Netlify](https://netlify.com) (automatischer Deploy bei jedem Push auf `main`)

## Struktur

```
.
├── deploy/              ← das, was Netlify veröffentlicht
│   ├── index.html         das Quiz
│   ├── impressum.html     rechtliche Angaben
│   └── datenschutz.html   Datenschutzerklärung
│
├── haarquiz.html        ← Master-Version fürs Bearbeiten
│                          (wird bei grösseren Änderungen in deploy/index.html kopiert)
│
├── netlify.toml         ← Netlify-Konfiguration (Publish-Verzeichnis, Security-Headers)
├── DEPLOY.md            ← Deployment-Anleitung
├── .gitignore
└── README.md
```

## Lokaler Workflow

Da es sich um reines statisches HTML handelt, reicht es, `deploy/index.html` im Browser zu öffnen zum Testen.

## Änderungen deployen

Nach Änderungen im `deploy/`-Ordner einfach committen und pushen:

```bash
git add .
git commit -m "beschreibung"
git push
```

Netlify deployed automatisch bei jedem Push auf den `main`-Branch.

## Design-System

Farben, Typografie und Komponenten folgen dem "Organic Clarity"-Design-System von Michaelas MONAT Academy. Siehe `design-system.md` im übergeordneten Projekt-Ordner.

## Technik

- Reines HTML + CSS + Vanilla JavaScript, kein Build-Schritt
- Google Fonts (Lexend, Plus Jakarta Sans)
- [html2canvas](https://html2canvas.hertzen.com/) via CDN für den Bild-Download des Haar-Profils
- Keine Cookies, kein Tracking, kein LocalStorage

## E-Mail-Flow (in Planung)

Aktuell ist der E-Mail-Versand noch nicht aktiv — das Quiz zeigt das Ergebnis direkt an. Der nächste Schritt ist eine **Netlify Function mit Resend**, die automatisch E-Mails an Michaela (mit den Quiz-Antworten) und an die Kundin (Bestätigung mit Haar-Profil) schickt.
