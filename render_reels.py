import os
import subprocess
import json
import sys
import multiprocessing
import re

# Konfiguration
AUDIO_DIR = "./audio_input"
OUTPUT_DIR = "./out"
REMOTION_COMP_ID = "MyVideo" # Deine Composition ID in Root.tsx
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def resolve_remotion_command():
    local_bin = os.path.join(PROJECT_ROOT, "node_modules", ".bin", "remotion")
    if not os.path.exists(local_bin):
        print("📦 Remotion CLI nicht gefunden. Installiere Dependencies mit npm ci...")
        subprocess.run(["npm", "ci"], check=True, cwd=PROJECT_ROOT)

    if not os.path.exists(local_bin):
        raise RuntimeError(
            "Remotion CLI konnte nicht aufgelöst werden. Prüfe package.json und npm-Installation."
        )

    return [local_bin]

def render_reels():
    os.chdir(PROJECT_ROOT)

    # Ordner prüfen
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    remotion_cmd = resolve_remotion_command()
    had_errors = False

    # Alle transkribierten JSON-Dateien im public Ordner finden
    # Wir nehmen die JSON als Basis, da sie beweist, dass Whisper fertig ist
    json_files = [f for f in os.listdir("./public") if f.endswith('.json')]

    if not json_files:
        print("❌ Keine JSON-Dateien in ./public gefunden. Hast du transcribe_audio.py ausgeführt?")
        return

    # NEU: Preset aus Kommandozeile auslesen
    selected_preset = "tiktok"  # Standard
    if "--preset" in sys.argv:
        try:
            selected_preset = sys.argv[sys.argv.index("--preset") + 1]
            print(f"📌 Nutze Preset: {selected_preset}")
        except IndexError:
            print("⚠️ Kein Preset nach --preset angegeben, nutze tiktok.")

    for j_file in json_files:
        base_name = os.path.splitext(j_file)[0]
        audio_file = f"{base_name}.mp3"
        output_file = f"{base_name}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_file)

        print(f"🚀 Starte Render für: {base_name}...")

        # Prüfe ob ein individueller Slides-Ordner für diese audioID existiert
        image_folder = None
        slides_path = os.path.join(PROJECT_ROOT, "public", "slides", base_name)
        if os.path.isdir(slides_path):
            image_folder = f"slides/{base_name}"
            print(f"📁 Nutze Slides-Ordner: {image_folder}")
        else:
            print(f"📁 Nutze Standard-Slides-Ordner (slides/default)")

        # Slides (PNG/MP4) erkennen und Typen ableiten
        slide_count = 5  # Default
        slide_types = []
        effective_slides_path = slides_path if os.path.isdir(slides_path) else os.path.join(PROJECT_ROOT, "public", "slides", "default")
        if os.path.isdir(effective_slides_path):
            pattern = re.compile(r"^slide(\d+)\.(png|mp4)$", re.IGNORECASE)
            by_index = {}

            for filename in os.listdir(effective_slides_path):
                match = pattern.match(filename)
                if not match:
                    continue
                idx = int(match.group(1))
                ext = match.group(2).lower()
                by_index.setdefault(idx, set()).add(ext)

            if by_index:
                # Nutze zusammenhängende Slides ab Index 0
                contiguous_indices = []
                i = 0
                while i in by_index:
                    contiguous_indices.append(i)
                    i += 1

                if contiguous_indices:
                    slide_count = len(contiguous_indices)
                    for idx in contiguous_indices:
                        exts = by_index[idx]
                        # MP4 priorisieren, falls beides vorhanden ist
                        slide_types.append("video" if "mp4" in exts else "image")

            print(f"🖼️  {slide_count} Slides gefunden (PNG/MP4) | Typen: {slide_types if slide_types else 'auto'}")

        # Props an Remotion übergeben
        input_props = {
            "audioID": base_name,
            "speedMode": "balanced",
            "captionStylePreset": selected_preset,
            "autoScaleExtremeWords": True,
            "slideCount": max(1, slide_count),
        }

        if slide_types:
            input_props["slideTypes"] = slide_types

        if image_folder:
            input_props["imageFolder"] = image_folder

        # --- Optional: eigenes Preset inline definieren ---
        # input_props["captionStylePreset"] = "brandBlue"
        # input_props["captionStylePresets"] = {
        #     "brandBlue": {
        #         "sidePaddingPct": 0.09,
        #         "sidePaddingMin": 40,
        #         "sidePaddingMax": 100,
        #         "fontScale": 0.064,
        #         "fontMin": 48,
        #         "fontMax": 86,
        #         "lineHeight": 1.08,
        #         "maxLines": 3,
        #         "maxWidth": "86%",
        #         "tokenGapEm": 0.15,
        #     }
        # }

        # --- Optional: pro Reel dynamisch wählen ---
        # if "instagram" in base_name:
        #     input_props["captionStylePreset"] = "instagram"
        # elif "shorts" in base_name:
        #     input_props["captionStylePreset"] = "youtubeShorts"

        cores = max(1, multiprocessing.cpu_count() // 2)

        # Remotion Render Befehl
        # Entry point (src/index.ts) wird als erstes Argument nach "render" benötigt
        cmd = [
            *remotion_cmd, "render", "src/index.ts", REMOTION_COMP_ID, output_path,
            "--props", json.dumps(input_props),
            "--concurrency=1",  # Single concurrency für Stabilität mit Video Extraction
            "--gl=angle",       # Oft nötig auf Headless Linux Servern
            "--timeout=900000"  # 900 Sekunden (15 min) Timeout für gesamten Render-Prozess
        ]

        try:
            subprocess.run(cmd, check=True, cwd=PROJECT_ROOT)
            print(f"✅ Video fertig: {output_path}")
        except subprocess.CalledProcessError as e:
            had_errors = True
            print(f"❌ Fehler beim Rendern von {base_name}: {e}")

    if had_errors:
        raise SystemExit(1)

if __name__ == "__main__":
    render_reels()