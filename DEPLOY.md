# Deploy-Anleitung — Haarquiz auf `haarquiz.ch`

> **Setup:** Domain bei **metanet.ch** registriert, Nameserver auf **Cloudflare**, Hosting auf **Netlify**.
> **Dauer:** ca. 15 Minuten aktive Arbeit, dann bis zu 15 Min. DNS-Propagation.

## Was wir deployen

Den Ordner `quiz/deploy/` — er enthält:

- `index.html` — das Quiz (wird beim Öffnen von `haarquiz.ch` angezeigt)
- `netlify.toml` — Netlify-Konfiguration mit Security-Headers und Caching-Regeln

## Schritt 1 — Quiz zu Netlify bringen (Drag-and-Drop)

1. Einloggen auf [app.netlify.com](https://app.netlify.com).
2. Falls noch nichts eingerichtet: Team-Name vergeben, dann landest du auf dem Dashboard.
3. Im linken Menü auf **"Sites"** (oder im Dashboard scrollen runter).
4. Unten auf der Sites-Seite gibt's eine Drop-Zone mit dem Text **"Want to deploy a new site without connecting to Git? Drag and drop your site output folder here"**.
5. Den kompletten Ordner `quiz/deploy/` (**nicht die einzelnen Dateien, sondern den Ordner**) per Drag-and-Drop in die Drop-Zone ziehen.
6. Netlify deployt sofort. Nach ca. 30 Sekunden bekommst du eine URL wie `https://wunderbare-praline-abc123.netlify.app`.
7. Die URL aufrufen — **das Quiz sollte unter dieser temporären Adresse bereits live sein.** Einmal durchklicken, prüfen ob alles funktioniert.

## Schritt 2 — Site umbenennen (optional, aber hilfreich)

Damit die temporäre URL lesbar bleibt, solange die Domain noch nicht aktiv ist:

1. In Netlify auf die neu erstellte Site klicken.
2. **Site settings** → **Site information** → **Change site name**.
3. Vorschlag: `michaelas-haarquiz` → ergibt `michaelas-haarquiz.netlify.app`.

## Schritt 3 — Custom Domain bei Netlify hinzufügen

1. In Netlify auf die Site → **Domain management** → **Add a domain** (oder "Add custom domain").
2. Eintragen: `haarquiz.ch` → **Verify** klicken.
3. Netlify meldet: *"Another Netlify user already owns this domain"* — das ignorieren, weiter mit **"Add domain"**.
4. Die Domain erscheint jetzt als "Awaiting external DNS" oder ähnlich.
5. Netlify zeigt dir die DNS-Einträge, die du in Cloudflare setzen musst — meistens entweder:
   - **A-Record** auf `75.2.60.5` (Netlifys Load Balancer IP)
   - **CNAME** `apex.netlify.com` oder deine spezifische `*.netlify.app`-Adresse

   → **Die genauen Werte bitte aus deinem Netlify-Dashboard entnehmen**, sie können sich ändern.

## Schritt 4 — DNS-Einträge in Cloudflare setzen

1. Einloggen auf [dash.cloudflare.com](https://dash.cloudflare.com).
2. Domain `haarquiz.ch` auswählen.
3. Links im Menü: **DNS** → **Records**.
4. Falls dort bereits Einträge sind, die auf metanet.ch oder sonstwo zeigen: **Diese löschen oder deaktivieren** (mindestens die A- und CNAME-Einträge für `@` und `www`).
5. Neue Einträge anlegen, basierend auf dem, was Netlify in Schritt 3 genannt hat. Typisch:

   **Apex (`haarquiz.ch` selbst):**
   - Type: `A`
   - Name: `@` (oder leer, je nach Cloudflare-UI)
   - IPv4 address: *(was Netlify vorgegeben hat, meist `75.2.60.5`)*
   - Proxy status: **DNS only** (graue Wolke) — wichtig fürs erste Deployment, kann später auf Proxy umgestellt werden
   - TTL: Auto

   **www-Subdomain (`www.haarquiz.ch`):**
   - Type: `CNAME`
   - Name: `www`
   - Target: *(deine netlify.app-URL, z.B. `michaelas-haarquiz.netlify.app`)*
   - Proxy status: **DNS only** (graue Wolke)
   - TTL: Auto

6. Änderungen **speichern**.

> **Warum "DNS only" und nicht Proxy?** Cloudflare kann sonst mit dem automatischen SSL-Zertifikat von Netlify kollidieren (doppelte Verschlüsselung → Schleife). Erstmal sauber DNS-only. Nachdem HTTPS läuft, kann man den Proxy später gezielt aktivieren für Performance-Vorteile.

## Schritt 5 — Warten und testen

- DNS-Propagation: bei Cloudflare meist 1–5 Minuten, offiziell bis zu 24 Stunden.
- In Netlify zeigt das Domain-Management nach kurzer Zeit **"Netlify DNS" oder "Configured correctly"** als Status.
- Dann im Browser `https://haarquiz.ch` aufrufen.
- Netlify provisioniert automatisch ein SSL-Zertifikat (Let's Encrypt) — das kann 1–5 Minuten dauern. In dieser Zeit eventuell eine Zertifikats-Warnung, danach alles grün.

## Schritt 6 — Finaler Check

- `haarquiz.ch` → lädt Quiz ✓
- `www.haarquiz.ch` → redirectet auf `haarquiz.ch` ✓
- `https://` funktioniert und zeigt gültiges Zertifikat ✓
- Quiz einmal komplett durchklicken: Fragen → Email → Ergebnis → Share-Card-Download ✓

## Wichtig zu wissen

**Das Quiz ist live, aber der E-Mail-Versand funktioniert noch nicht.** Die aktuelle Version zeigt das Ergebnis nach 2,2 Sekunden Loader — ohne dass wirklich eine E-Mail rausgeht. Das ist Absicht: Wir wollen erst testen, dass das Quiz läuft, bevor wir den Backend-Teil anbinden.

Der nächste Schritt ist dann: **Resend-Integration** über eine Netlify Function, damit bei jeder Quiz-Ausfüllung automatisch eine E-Mail an Michaela (mit allen Antworten strukturiert) und eine Bestätigung an die Kundin geht.

## Updates später

Wenn das Quiz geändert wird:

- Entweder **wieder Drag-and-Drop** des `quiz/deploy/`-Ordners auf die bestehende Netlify-Site → Netlify deployt die neue Version.
- Oder: **Git-Integration** einrichten (GitHub Repo → Netlify → automatischer Deploy bei jedem Push).

Git ist besser für häufige Updates. Drag-and-Drop reicht am Anfang.
