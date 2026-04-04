# Manuelle Erstellung von Bildern und Videos — Schritt-für-Schritt

Dieses Dokument erklärt, wie du mit den beiden Skripten `generate_images_manual_api.py` und `animate_slides_wavespeed.py` manuell Bilder und Videos für deine Reels erstellst.

## Übersicht

| Schritt | Zweck | Skript | Input | Output |
|---------|-------|--------|-------|--------|
| 1a | Bild-Prompts | — | JSON-Datei | `scripts/<audioID>.prompts.json` |
| 1b | Video-Prompts | — | JSON-Datei | `scripts/<audioID>.prompts.video.json` |
| 2 | Bilder generieren | `generate_images_manual_api.py` | `.prompts.json` + Google API | `public/slides/<audioID>/slide{0..N}.png` |
| 3 | Videos animieren | `animate_slides_wavespeed.py` | `.prompts.video.json` + WaveSpeed API | `public/slides/<audioID>/slide{0..N}.mp4` |

## Prerequisite: API-Keys in `.env` setzen

Datei: `.env` im Projektroot

```env
NANO_BANANA_API_KEY=<dein-google-key>
WAVESPEED_API_KEY=<dein-wavespeed-key>
```

Falls `.env` fehlt, erstelle sie oder setze die Variablen als Umgebungsvariablen.

---

## Schritt 1: JSON-Prompts vorbereiten

### Dateiorte

**Für Bilder (Google API):**
- `scripts/<audioID>.prompts.json`
- Beispiel: `scripts/ReelIT001.prompts.json`

**Für Videos (WaveSpeed API):**
- `scripts/<audioID>.prompts.video.json`
- Beispiel: `scripts/ReelIT001.prompts.video.json`

**Hinweis:** Beide Dateien sind optional und unabhängig. Du kannst:
- Nur Bilder generieren (nutze `.prompts.json`)
- Nur Videos generieren (nutze `.prompts.video.json`)
- Beide generieren (nutze beide Dateien mit ggf. unterschiedlichen Prompts)

### Format (identisch für beide)

```json
{
  "prompts": [
    "Slide0: A small chibi figure lying wide-awake in bed at night...",
    "Slide1: A dynamic middle scene visualizing the core message...",
    "Slide2: A close-up storytelling detail connected to the story...",
    "Slide3: A contrast scene that builds tension...",
    "Slide4: A strong closing visual for the narrative..."
  ]
}
```

**Beispiel unterschiedlicher Prompts:**

`ReelIT001.prompts.json` (für Bilder):
```json
{"prompts": ["Detailed illustration of...", ...]}
```

`ReelIT001.prompts.video.json` (für Videos/Animation):
```json
{"prompts": ["Dynamic camera movement showing...", ...]}
```

**Regeln:**
- `prompts` muss ein Array sein ✓
- Jeder Prompt muss ein non-leer String sein ✓
- Array darf nicht leer sein ✓
- Nur valides JSON erlaubt ✓

### Beispiel-Validierung

```bash
# Prüfen, ob JSON valide ist (optional)
python3 -m json.tool scripts/ReelIT001.prompts.json
```

---

## Schritt 2: Bilder generieren

### Befehl

```bash
python3 scripts/generate_images_manual_api.py --audio-id ReelIT001
```

### Optionen

| Flag | Default | Beschreibung |
|------|---------|-------------|
| `--audio-id` | — | Audio-ID (benötigt für einzelnen Reel) |
| `--all` | — | Alle verfügbaren IDs (aus `audio_input/*.mp3` + `scripts/*.prompts.json`) |
| `--slides N` | alle | Nur erste N Prompts verwenden |
| `--force` | — | Existierende `slideX.png` überschreiben |
| `--model` | `gemini-3.1-flash-image-preview` | Modellname (override) |
| `--delay` | `5.0` | Pause (Sek.) zwischen erfolgreichen Requests |
| `--max-retries` | `4` | Max. Retries bei transienten Fehlern (429/503) |

### Beispiele

**Single Reel:**
```bash
python3 scripts/generate_images_manual_api.py --audio-id ReelIT001
```

**Batch (alle verfügbaren IDs):**
```bash
python3 scripts/generate_images_manual_api.py --all
```

**Mit Überschreiben (max. 6 Prompts):**
```bash
python3 scripts/generate_images_manual_api.py --audio-id ReelIT001 --slides 6 --force
```

### Output

```
🎨 Generiere JSON-Slides für: ReelIT001 (Modell: gemini-3.1-flash-image-preview)

  🧠 Erzeuge Slide 0...
  ✅ Slide 0 gespeichert: public/slides/ReelIT001/slide0.png
  🧠 Erzeuge Slide 1...
  ✅ Slide 1 gespeichert: public/slides/ReelIT001/slide1.png
  ...

📊 Zusammenfassung
   Angefragt:      5
   Neu erzeugt:    5
   Übersprungen:   0
   Fehlgeschlagen: 0
```

---

## Schritt 3: Videos animieren (Optional)

Nachdem Bilder existieren, kannst du sie optional in Videos konvertieren. **Videos nutzen separate Prompts** aus `.prompts.video.json`.

**⚠️ Wichtig:** Das Skript sucht nach den **Startbildern** in `public/slides/<audioID>/slideX.png`. Diese müssen zuerst mit Schritt 2 erzeugt worden sein, sonst schlägt das Skript mit klarer Fehlermeldung ab.

**Ken-Burns Verhalten im finalen Render:** Der Ken-Burns-Effekt auf Video-Slides wird nur auf den gehaltenen Endframe angewendet (nachdem die MP4 einmal fertig abgespielt wurde). Während die MP4 aktiv läuft, wird kein Ken-Burns-Transform angewendet. Falls du das nicht möchtest, setze beim Rendern `applyKenBurnsToVideos: false`.

### Befehl

```bash
python3 scripts/animate_slides_wavespeed.py --audio-id ReelIT001
```

**Wichtig:** Das Skript erwartet `scripts/ReelIT001.prompts.video.json`, nicht `.prompts.json`.

### Optionen

| Flag | Default | Beschreibung |
|------|---------|-------------|
| `--audio-id` | — | Audio-ID (benötigt für einzelnen Reel) |
| `--all` | — | Alle verfügbaren IDs |
| `--aspect-ratio` | `9:16` | Seitenverhältnis |
| `--resolution` | `720p` | Auflösung |
| `--duration` | `4` | Videodauer (Sekunden) |
| `--generate-audio` | `false` | Audio-Track erzeugen |
| `--concurrency` | `1` | Parallele Videos gleichzeitig |
| `--force` | — | Existierende `slideX.mp4` überschreiben |
| `--poll-timeout` | `900` | Max. Warte-Zeit pro Video (Sek.) |

### Beispiele

**Basic (standard Einstellungen):**
```bash
python3 scripts/animate_slides_wavespeed.py --audio-id ReelIT001
```

**Parallel (schneller, aber teurer):**
```bash
python3 scripts/animate_slides_wavespeed.py --audio-id ReelIT001 --concurrency 3
```

**Custom Einstellungen:**
```bash
python3 scripts/animate_slides_wavespeed.py \
  --audio-id ReelIT001 \
  --aspect-ratio 9:16 \
  --resolution 1080p \
  --duration 5 \
  --force
```

### Output

```
🎬 Erstelle Animations-Videos für: ReelIT001
  Prompts:        .../scripts/ReelIT001.prompts.video.json
   Target:         .../public/slides/ReelIT001
   Model:          bytedance/seedance-v1.5-pro/image-to-video
   Aspect Ratio:   9:16
   Resolution:     720p
   Duration:       4s
   Generate Audio: False
   Concurrency:    1
   Übersprungen:   0
   Zu generieren:  5

  🎬 slide0: Upload startet...
  🚀 slide0: Generation submit...
  ⏳ slide0: Polling task=xyz...
  ✅ slide0: Gespeichert: public/slides/ReelIT001/slide0.mp4

  ... weitere Slides ...

  📊 Ergebnis für ReelIT001
     Erfolgreich:   5
     Fehlgeschlagen:0
     Übersprungen:  0
```

---

## Workflow-Beispiel: Von Anfang bis zum finalen Reel

### 1a. Bild-Prompts schreiben

Datei: `scripts/MyReel.prompts.json`

```json
{
  "prompts": [
    "Slide 0: Establishing shot of a futuristic city at dawn...",
    "Slide 1: Close-up on a robot's glowing eyes...",
    "Slide 2: Wide view of robots marching in formation...",
    "Slide 3: Dramatic confrontation scene...",
    "Slide 4: Sunset horizon with silhouettes..."
  ]
}
```

### 1b. Video-Prompts schreiben (optional, separate Datei)

Datei: `scripts/MyReel.prompts.video.json`

```json
{
  "prompts": [
    "Slide 0: Camera pans across futuristic cityscape with dynamic lighting...",
    "Slide 1: Smooth zoom into robot's eyes with glowing effect...",
    "Slide 2: robots march left to right with rhythmic motion...",
    "Slide 3: Dramatic shake and rotation for confrontation...",
    "Slide 4: Slow sunset fade with silhouette zoom-out..."
  ]
}
```

**Hinweis:** Die Video-Prompts können ganz anders sein oder sogar weggelassen werden, wenn du nur Bilder brauchst.

### 2. Bilder generieren (nutzt .prompts.json)

```bash
python3 scripts/generate_images_manual_api.py --audio-id MyReel
```

**Wartezeit:** ~30–60 Sekunden (abhängig von API und Retry-Logik)

**⚠️ Pflichtschritt falls videos erwünscht:** Wenn du Videos animieren möchtest, müssen die PNGs zuerst hier existieren. Das WaveSpeed-Skript lädt diese PNGs als Startbilder.

### 3. Bilder prüfen (lokal oder AWS)

```bash
ls -lh public/slides/MyReel/
# slide0.png, slide1.png, slide2.png, slide3.png, slide4.png
```

### 4. Videos generieren (nutzt .prompts.video.json)

Nur ausführen, wenn Bilder aus Schritt 2 existieren:

```bash
python3 scripts/animate_slides_wavespeed.py --audio-id MyReel
```

**Wartezeit:** ~5–15 Minuten (abhängig von Concurrency und API Load)

### 5. Assets im Remotion-Render nutzen

```bash
npx remotion render MyVideo out.mp4 \
  --props='{"audioID":"MyReel","imageFolder":"slides/MyReel","slideCount":5}'
```

---

## Fehlerbehandlung

### JSON-Fehler

```
❌ Vorbereitung fehlgeschlagen für MyReel: Ungültiges JSON in .../scripts/MyReel.prompts.json: ...
```

**Lösung:** JSON mit einem Online-Tool validieren oder lokal prüfen:
```bash
python3 -m json.tool scripts/MyReel.prompts.json | head
```

### API-Key fehlt

```
❌ Kein API-Key gefunden. Setze NANO_BANANA_API_KEY (oder GOOGLE_API_KEY) in .env oder als Umgebungsvariable.
```

**Lösung:** `.env` aktualisieren oder Umgebungsvariable setzen:
```bash
export NANO_BANANA_API_KEY=your_key_here
export WAVESPEED_API_KEY=your_wavespeed_key_here
```

### Transienter Fehler (429 / Timeout)

```
⚠️ Temporärer Fehler (Versuch 1/4). Warte 12.5s...
```

**Normal!** Das Skript versucht automatisch Retry mit exponentiellem Backoff.

### API antwortet mit Fehler

```
❌ HTTP 503 @ https://...: Service Unavailable
```

**Lösung:** Warte 5–10 Minuten, dann erneut versuchen (oder `--force` nutzen, um gezielt zu wiederholen).

---

## Tipps & Best Practices

- **Beginne klein:** Mit `--audio-id` für einen Reel testen, bevor `--all` läufst.
- **Concurrency nutzen:** Bei Videos: `--concurrency 2–3` für parallele Generierung (kostet mehr, geht schneller).
- **Dry-Run-Simulation:** Vor großem Batch kurz testen mit `--slides 1`.
- **Logfile speichern:** 
  ```bash
  python3 scripts/generate_images_manual_api.py --audio-id MyReel > generation.log 2>&1
  ```
- **Prompt-Qualität:** Je detaillierter die Prompts, desto besser die Ergebnisse. Zahlen, Farben, Stimmung angeben.

---

## Verzeichnisstruktur nach Completion

```
my-video/
├── scripts/
│   ├── MyReel.prompts.json        ← Input für Bilder
│   ├── MyReel.prompts.video.json  ← Input für Videos (optional)
│   ├── generate_images_manual_api.py
│   └── animate_slides_wavespeed.py
├── public/slides/
│   └── MyReel/
│       ├── slide0.png             ← Nach Schritt 2
│       ├── slide1.png
│       ├── ...
│       ├── slide0.mp4             ← Nach Schritt 4 (optional)
│       ├── slide1.mp4
│       └── ...
└── .env                           ← API-Keys
```

---

## Support

Bei Fehlern: Logs checken, JSON validieren, API-Keys prüfen, ggf. nochmal versuchen (mit `--force` für Überschreiben).
