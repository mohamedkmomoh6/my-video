import argparse
import base64
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from typing import Iterable, List, Optional

try:
    from google import genai
except ImportError as exc:
    raise SystemExit(
        "❌ Das Paket 'google-genai' fehlt. Bitte installiere es mit pip (z. B. pip install google-genai)."
    ) from exc


AUDIO_DIR = "./audio_input"
SCRIPTS_DIR = "./scripts"
SLIDES_BASE_DIR = "./public/slides"

DEFAULT_MODEL = os.getenv("GOOGLE_IMAGE_MODEL", "gemini-3.1-flash-image-preview")
DEFAULT_SLIDE_COUNT = 5
DEFAULT_DELAY_SECONDS = 5
DEFAULT_MAX_RETRIES = 4

RETRIABLE_ERROR_TOKENS = [
    "429",
    "503",
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "INTERNAL",
    "rate",
    "quota",
    "timeout",
    "deadline",
    "temporar",
    "connection",
    "reset by peer",
]


def configure_output_buffering() -> None:
    # Sofortige Log-Ausgabe auch bei Umleitung in Dateien (z. B. nohup > production_log.txt)
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(line_buffering=True)


@dataclass
class GenerationStats:
    requested: int = 0
    generated: int = 0
    skipped_existing: int = 0
    failed: int = 0


def load_dotenv_if_present(path: str = ".env") -> None:
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def get_api_key() -> str:
    load_dotenv_if_present()
    api_key = os.getenv("NANO_BANANA_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit(
            "❌ Kein API-Key gefunden. Setze NANO_BANANA_API_KEY (oder GOOGLE_API_KEY) in .env oder als Umgebungsvariable."
        )
    return api_key


def list_audio_ids() -> List[str]:
    if not os.path.isdir(AUDIO_DIR):
        return []
    return sorted(
        os.path.splitext(name)[0]
        for name in os.listdir(AUDIO_DIR)
        if name.lower().endswith(".mp3")
    )


def split_script_into_chunks(script_text: str, chunk_count: int) -> List[str]:
    clean = re.sub(r"\s+", " ", script_text).strip()
    if not clean:
        return []

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if s.strip()]
    if not sentences:
        return []

    if len(sentences) >= chunk_count:
        chunk_size = max(1, len(sentences) // chunk_count)
        chunks: List[str] = []
        start = 0
        while start < len(sentences) and len(chunks) < chunk_count:
            end = len(sentences) if len(chunks) == chunk_count - 1 else min(len(sentences), start + chunk_size)
            chunks.append(" ".join(sentences[start:end]))
            start = end
        return chunks

    words = clean.split()
    words_per_chunk = max(1, len(words) // chunk_count)
    chunks = []
    for idx in range(chunk_count):
        begin = idx * words_per_chunk
        if idx == chunk_count - 1:
            piece = words[begin:]
        else:
            piece = words[begin : begin + words_per_chunk]
        if piece:
            chunks.append(" ".join(piece))
    return chunks


def with_style(prompt: str) -> str:
    style = (
        "Create a cinematic, high-contrast vertical 9:16 scene for a social media reel, "
        "ultra detailed, modern color grading, no text, no watermark."
    )
    return f"{style} Scene idea: {prompt.strip()}"


def load_prompts_for_audio(audio_id: str, slide_count: int) -> List[str]:
    json_path = os.path.join(SCRIPTS_DIR, f"{audio_id}.prompts.json")
    txt_path = os.path.join(SCRIPTS_DIR, f"{audio_id}.prompts.txt")
    script_path = os.path.join(SCRIPTS_DIR, f"{audio_id}.txt")

    prompts: List[str] = []

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict) and isinstance(data.get("prompts"), list):
            prompts = [str(p).strip() for p in data["prompts"] if str(p).strip()]
        elif isinstance(data, list):
            prompts = [str(p).strip() for p in data if str(p).strip()]

    elif os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            prompts = [line.strip() for line in f.readlines() if line.strip()]

    elif os.path.exists(script_path):
        with open(script_path, "r", encoding="utf-8") as f:
            script_text = f.read()
        prompts = split_script_into_chunks(script_text, slide_count)

    if not prompts:
        prompts = [
            f"An atmospheric opening shot for reel topic {audio_id}",
            f"A dynamic middle scene visualizing the core message of {audio_id}",
            f"A close-up storytelling detail connected to {audio_id}",
            f"A contrast scene that builds tension for {audio_id}",
            f"A strong closing visual for {audio_id}",
        ]

    normalized = [with_style(p) for p in prompts]

    if len(normalized) < slide_count:
        base_pool = normalized.copy()
        while len(normalized) < slide_count:
            seed = base_pool[(len(normalized) - 1) % len(base_pool)] if base_pool else with_style(audio_id)
            normalized.append(f"{seed} Variation {len(normalized) + 1}.")

    return normalized[:slide_count]


def iter_response_parts(response: object) -> Iterable[object]:
    parts = getattr(response, "parts", None)
    if isinstance(parts, list):
        for part in parts:
            yield part

    candidates = getattr(response, "candidates", None)
    if isinstance(candidates, list):
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            candidate_parts = getattr(content, "parts", None)
            if isinstance(candidate_parts, list):
                for part in candidate_parts:
                    yield part


def try_save_part_as_png(part: object, filename: str) -> bool:
    inline_data = getattr(part, "inline_data", None)
    if inline_data is not None:
        data = getattr(inline_data, "data", None)
        if data:
            if isinstance(data, str):
                try:
                    payload = base64.b64decode(data)
                except Exception:
                    payload = data.encode("utf-8", errors="ignore")
            else:
                payload = data

            if payload:
                with open(filename, "wb") as f:
                    f.write(payload)
                return True

    as_image = getattr(part, "as_image", None)
    if callable(as_image):
        image = as_image()
        image.save(filename)
        return True

    return False


def generate_slide_with_retry(
    client: "genai.Client",
    model: str,
    prompt: str,
    filename: str,
    delay_seconds: float,
    max_retries: int,
) -> bool:
    attempt = 0
    while attempt <= max_retries:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[prompt],
            )

            for part in iter_response_parts(response):
                if try_save_part_as_png(part, filename):
                    return True

            raise RuntimeError("API-Antwort enthält kein Bild.")

        except Exception as e:  # noqa: BLE001
            attempt += 1
            msg = str(e)
            normalized_msg = msg.lower()
            retriable = any(token.lower() in normalized_msg for token in RETRIABLE_ERROR_TOKENS)
            if attempt > max_retries or not retriable:
                print(f"    ❌ Fehler: {e}")
                return False

            wait_seconds = min(120, max(8, delay_seconds * (2 ** attempt))) + random.uniform(0, 1.5)
            print(f"    ⚠️ Temporärer Fehler (Versuch {attempt}/{max_retries}). Warte {wait_seconds:.1f}s...")
            time.sleep(wait_seconds)


def generate_for_audio_id(
    client: "genai.Client",
    audio_id: str,
    slide_count: int,
    model: str,
    delay_seconds: float,
    max_retries: int,
) -> GenerationStats:
    target_dir = os.path.join(SLIDES_BASE_DIR, audio_id)
    os.makedirs(target_dir, exist_ok=True)

    prompts = load_prompts_for_audio(audio_id, slide_count)
    stats = GenerationStats(requested=slide_count)

    print(f"\n🎨 Generiere Slides für: {audio_id} (Modell: {model})")

    for i, prompt in enumerate(prompts):
        png_filename = os.path.join(target_dir, f"slide{i}.png")
        mp4_filename = os.path.join(target_dir, f"slide{i}.mp4")

        if os.path.exists(png_filename) or os.path.exists(mp4_filename):
            stats.skipped_existing += 1
            existing_type = "MP4" if os.path.exists(mp4_filename) else "PNG"
            print(f"  ↩️ Slide {i} existiert bereits ({existing_type}), überspringe.")
            continue

        print(f"  🧠 Erzeuge Slide {i}...")
        ok = generate_slide_with_retry(
            client=client,
            model=model,
            prompt=prompt,
            filename=png_filename,
            delay_seconds=delay_seconds,
            max_retries=max_retries,
        )

        if ok:
            stats.generated += 1
            print(f"  ✅ Slide {i} gespeichert: {png_filename}")
            time.sleep(delay_seconds)
        else:
            stats.failed += 1

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Automatische Bildgenerierung für Reels mit Google Nano Banana / Gemini Image.")
    parser.add_argument("--audio-id", dest="audio_ids", action="append", help="Eine Audio-ID (Dateiname ohne .mp3). Kann mehrfach genutzt werden.")
    parser.add_argument("--all", action="store_true", help="Für alle MP3-Dateien in ./audio_input generieren.")
    parser.add_argument("--slides", type=int, default=DEFAULT_SLIDE_COUNT, help="Anzahl Slides pro Reel (Default: 5).")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Modellname (Default: {DEFAULT_MODEL}).")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS, help="Pause in Sekunden zwischen erfolgreichen Requests.")
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES, help="Maximale Retries bei 429/Quota/Timeout.")
    return parser.parse_args()


def main() -> int:
    configure_output_buffering()
    args = parse_args()

    if args.slides < 1:
        print("❌ --slides muss mindestens 1 sein.")
        return 2

    audio_ids = args.audio_ids[:] if args.audio_ids else []
    if args.all:
        audio_ids.extend(list_audio_ids())
    audio_ids = sorted(set(audio_ids))

    if not audio_ids:
        print("⚠️ Keine Audio-IDs gefunden. Nutze --all oder --audio-id <id>.")
        return 0

    api_key = get_api_key()
    client = genai.Client(api_key=api_key)

    grand = GenerationStats()

    for audio_id in audio_ids:
        stats = generate_for_audio_id(
            client=client,
            audio_id=audio_id,
            slide_count=args.slides,
            model=args.model,
            delay_seconds=args.delay,
            max_retries=args.max_retries,
        )
        grand.requested += stats.requested
        grand.generated += stats.generated
        grand.skipped_existing += stats.skipped_existing
        grand.failed += stats.failed

    print("\n📊 Zusammenfassung")
    print(f"   Angefragt:      {grand.requested}")
    print(f"   Neu erzeugt:    {grand.generated}")
    print(f"   Übersprungen:   {grand.skipped_existing}")
    print(f"   Fehlgeschlagen: {grand.failed}")

    return 1 if grand.failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())