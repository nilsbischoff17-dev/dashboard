# Persönliches Dashboard (PWA)

Progressive Web App für Android und Windows, die Aufgaben (später auch Notizen, Kalender, Einkaufslisten u. a.) aus einem Google-Drive-Ordner anzeigt und bearbeitet. Datenschema: `Dashboard/SCHEMA.md` im Drive-Ordner. Die ausführliche Projektplanung (`CLAUDE.md`) liegt nur lokal und ist bewusst nicht Teil dieses öffentlichen Repositorys.

Kein Build-Schritt: reines HTML/CSS/JavaScript (ES-Module). Jede Datei wird so ausgeliefert, wie sie hier liegt.

## Lokal starten

```bash
python tools/serve.py
```

Dann <http://localhost:8080> öffnen. Ohne Google-Client-ID funktioniert nur „Demo ansehen“ (Daten nur im Browser).

## Google-Anmeldung einrichten (einmalig, ca. 10 Minuten)

1. <https://console.cloud.google.com> → oben **Neues Projekt** anlegen, z. B. „Dashboard“.
2. **APIs & Dienste → Bibliothek** → „Google Drive API“ suchen → **Aktivieren**.
3. **Google Auth Platform** (bzw. „OAuth-Zustimmungsbildschirm“) → **Jetzt starten**:
   - App-Name „Dashboard“, Support-E-Mail = deine Gmail-Adresse
   - Zielgruppe: **Extern**
   - Unter **Zielgruppe → Testnutzer** deine eigene Gmail-Adresse hinzufügen
   - Unter **Datenzugriff → Bereiche hinzufügen**: `https://www.googleapis.com/auth/drive`
4. **Clients → Client erstellen** → Typ **Webanwendung**
   - **Autorisierte JavaScript-Quellen:** `http://localhost:8080` (später zusätzlich die HTTPS-Adresse, unter der die App gehostet wird)
   - Weiterleitungs-URIs: keine nötig
5. Die angezeigte **Client-ID** (`…apps.googleusercontent.com`) in [config.js](config.js) bei `googleClientId` eintragen.

Beim ersten Login zeigt Google „Diese App wurde nicht von Google überprüft“ – das ist für eine private App im Testmodus normal: **Erweitert → Weiter zu Dashboard**.

Ein Login hält ca. 1 Stunde; danach reicht ein Tipp auf „Weiter mit Google“ (das Google-Fenster schließt sich sofort wieder).

## Aufs Handy bringen

Die App läuft über GitHub Pages unter **<https://nilsbischoff17-dev.github.io/dashboard/>** (veröffentlicht automatisch jeden Push auf `main`, Dauer ca. 1 Minute). Diese Adresse ist im OAuth-Client als JavaScript-Quelle `https://nilsbischoff17-dev.github.io` eingetragen.

In Chrome auf Android: Adresse öffnen → anmelden → Menü ⋮ → **App installieren**.

## Aufbau

```
index.html, manifest.webmanifest, sw.js   PWA-Grundgerüst (Service Worker: App-Shell offline)
config.js                                 Client-ID, Drive-Ordner-ID, Berechtigungen
css/app.css                               Layout: Handy = touch-optimiert, Maus = dichter
js/app.js                                 Rahmen: Login, Navigation, Fehler-/Sync-Anzeige
js/auth.js                                Google-Anmeldung (Google Identity Services)
js/backends/drive.js                      Lesen/Schreiben im Drive-Ordner „Dashboard“ über Pfade
js/backends/demo.js                       Gleiche Schnittstelle, Daten im Browser
js/data/tasks.js                          Aufgaben-Datenlogik inkl. Konflikterkennung
js/modules/                               Ein Modul pro Datei; Registrierung in modules/index.js
tools/                                    Dev-Server, Icon-Generator
```

**Neues Modul hinzufügen:** Datei in `js/modules/` anlegen (`{ id, label, icon, mount(el, ctx) }`), in `js/modules/index.js` eintragen und im `SHELL`-Array von `sw.js` ergänzen. Sobald es mehr als ein Modul gibt, erscheint automatisch die Navigation (unten am Handy, links am PC).

**Konflikte:** Vor jedem Speichern wird die Datei in Drive neu gelesen, wenn sich ihre Version geändert hat. Änderungen an *anderen* Einträgen (z. B. durch Claude) bleiben erhalten; wurde *derselbe* Eintrag zwischenzeitlich geändert (`updated_at` weicht ab), fragt die App nach, statt still zu überschreiben.
