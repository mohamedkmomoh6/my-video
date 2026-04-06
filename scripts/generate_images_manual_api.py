#!/usr/bin/env python3
import argparse
import base64
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

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
DEFAULT_DELAY_SECONDS = 5.0
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

SLIDE_KEY_PATTERN = re.compile(r"^slide\s*(\d+)$", re.IGNORECASE)


@dataclass
class GenerationStats:
    requested: int = 0
    generated: int = 0
    skipped_existing: int = 0
    failed: int = 0


def configure_output_buffering() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(line_buffering=True)


def load_dotenv_if_present(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_api_key() -> str:
    api_key = os.getenv("NANO_BANANA_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit(
            "❌ Kein API-Key gefunden. Setze NANO_BANANA_API_KEY (oder GOOGLE_API_KEY) in .env oder als Umgebungsvariable."
        )
    return api_key


def list_audio_ids() -> List[str]:
    audio_ids = set()

    audio_dir = Path(AUDIO_DIR)
    if audio_dir.is_dir():
        for file in audio_dir.iterdir():
            if file.is_file() and file.suffix.lower() == ".mp3":
                audio_ids.add(file.stem)

    scripts_dir = Path(SCRIPTS_DIR)
    if scripts_dir.is_dir():
        for file in scripts_dir.iterdir():
            if file.is_file() and file.name.endswith(".prompts.json"):
                audio_ids.add(file.name[: -len(".prompts.json")])

    return sorted(audio_ids)


def _validate_prompt_entries(prompts_raw: object, source_path: Path, field_label: str) -> List[str]:
    if not isinstance(prompts_raw, list):
        raise ValueError(f"Ungültiges JSON in {source_path}: '{field_label}' muss ein Array sein.")

    prompts: List[str] = []
    for idx, entry in enumerate(prompts_raw):
        if not isinstance(entry, str):
            raise ValueError(f"Ungültiger Prompt in {source_path}: {field_label}[{idx}] ist kein String.")
        cleaned = entry.strip()
        if not cleaned:
            raise ValueError(f"Ungültiger Prompt in {source_path}: {field_label}[{idx}] ist leer.")
        prompts.append(cleaned)

    if not prompts:
        raise ValueError(f"Ungültiges JSON in {source_path}: 'prompts' darf nicht leer sein.")

    return prompts


def _normalize_prompt_payload(data: object, source_path: Path) -> Tuple[List[str], bool]:
    if not isinstance(data, dict):
        raise ValueError(f"Ungültiges JSON in {source_path}: Erwartet Objekt mit Schlüssel 'prompts'.")

    if "prompts" in data:
        prompts = _validate_prompt_entries(data.get("prompts"), source_path, "prompts")
        normalized_payload = {"prompts": prompts}
        changed = data != normalized_payload
        return prompts, changed

    slide_items: List[Tuple[int, object]] = []
    for key, value in data.items():
        if not isinstance(key, str):
            continue
        match = SLIDE_KEY_PATTERN.match(key.strip())
        if not match:
            continue
        slide_items.append((int(match.group(1)), value))

    if not slide_items:
        raise ValueError(
            f"Ungültiges JSON in {source_path}: Erwartet 'prompts' Array oder Slide0/Slide1/...-Objekt."
        )

    slide_items.sort(key=lambda item: item[0])
    prompts = _validate_prompt_entries([value for _, value in slide_items], source_path, "Slide")
    return prompts, True


def load_prompts_json(prompt_file: Path, requested_slides: Optional[int]) -> List[str]:
    if not prompt_file.exists():
        raise ValueError(f"Prompt-Datei fehlt: {prompt_file}")

    try:
        data = json.loads(prompt_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Ungültiges JSON in {prompt_file}: {exc}") from exc

    prompts, changed = _normalize_prompt_payload(data, prompt_file)

    if changed:
        normalized_payload = {"prompts": prompts}
        try:
            prompt_file.write_text(
                json.dumps(normalized_payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError as exc:
            raise ValueError(f"Konnte normalisierte Prompt-Datei nicht schreiben ({prompt_file}): {exc}") from exc

        print(f"  ♻️ Prompt-JSON auto-korrigiert: {prompt_file} -> {{'prompts': [...]}}")

    if requested_slides is not None:
        if requested_slides < 1:
            raise ValueError("--slides muss mindestens 1 sein.")
        if len(prompts) < requested_slides:
            raise ValueError(
                f"Zu wenige Prompts in {prompt_file}: benötigt {requested_slides}, gefunden {len(prompts)}."
            )
        return prompts[:requested_slides]

    return prompts


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


def try_save_part_as_png(part: object, filename: Path) -> bool:
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
                filename.write_bytes(payload)
                return True

    as_image = getattr(part, "as_image", None)
    if callable(as_image):
        image = as_image()
        image.save(str(filename))
        return True

    return False


def generate_slide_with_retry(
    client: "genai.Client",
    model: str,
    prompt: str,
    filename: Path,
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

        except Exception as exc:  # noqa: BLE001
            attempt += 1
            msg = str(exc).lower()
            retriable = any(token.lower() in msg for token in RETRIABLE_ERROR_TOKENS)

            if attempt > max_retries or not retriable:
                print(f"    ❌ Fehler: {exc}")
                return False

            wait_seconds = min(120.0, max(8.0, delay_seconds * (2**attempt))) + random.uniform(0, 1.5)
            print(f"    ⚠️ Temporärer Fehler (Versuch {attempt}/{max_retries}). Warte {wait_seconds:.1f}s...")
            time.sleep(wait_seconds)


def generate_for_audio_id(
    client: "genai.Client",
    audio_id: str,
    prompts: List[str],
    model: str,
    delay_seconds: float,
    max_retries: int,
    force: bool,
) -> GenerationStats:
    target_dir = Path(SLIDES_BASE_DIR) / audio_id
    target_dir.mkdir(parents=True, exist_ok=True)

    stats = GenerationStats(requested=len(prompts))

    print(f"\n🎨 Generiere JSON-Slides für: {audio_id} (Modell: {model})")

    for i, prompt in enumerate(prompts):
        png_filename = target_dir / f"slide{i}.png"
        mp4_filename = target_dir / f"slide{i}.mp4"

        if png_filename.exists() and not force:
            stats.skipped_existing += 1
            print(f"  ↩️ Slide {i} existiert bereits (PNG), überspringe.")
            continue

        if mp4_filename.exists() and not force:
            stats.skipped_existing += 1
            print(f"  ↩️ Slide {i} existiert bereits als MP4, überspringe PNG-Generation.")
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
    parser = argparse.ArgumentParser(
        description=(
            "Manuelle Bildgenerierung aus JSON-Prompts über Google Gemini Image API. "
            "Erwartet scripts/<audioID>.prompts.json mit {'prompts': [...]} und schreibt slideX.png nach public/slides/<audioID>/."
        )
    )

    parser.add_argument("--audio-id", dest="audio_ids", action="append", help="Audio-ID (Dateiname ohne .mp3). Kann mehrfach genutzt werden.")
    parser.add_argument("--all", action="store_true", help="Für alle verfügbaren Audio-IDs (aus ./audio_input und ./scripts/*.prompts.json).")
    parser.add_argument("--slides", type=int, default=None, help="Optional: maximale Anzahl Slides, die aus prompts[] verwendet werden.")

    parser.add_argument("--prompt-file", default=None, help="Optional: explizite Prompt-Datei. Nur mit genau einer --audio-id nutzbar.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Modellname (Default: {DEFAULT_MODEL}).")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS, help="Pause in Sekunden zwischen erfolgreichen Requests.")
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES, help="Maximale Retries bei 429/Quota/Timeout.")
    parser.add_argument("--force", action="store_true", help="Existierende slideX.png überschreiben.")

    return parser.parse_args()


def resolve_audio_ids(args: argparse.Namespace) -> List[str]:
    audio_ids = args.audio_ids[:] if args.audio_ids else []
    if args.all:
        audio_ids.extend(list_audio_ids())
    return sorted(set(audio_ids))


def resolve_prompt_file(audio_id: str, prompt_file_override: Optional[str]) -> Path:
    if prompt_file_override:
        return Path(prompt_file_override)
    return Path(SCRIPTS_DIR) / f"{audio_id}.prompts.json"


def main() -> int:
    configure_output_buffering()

    project_root = Path(__file__).resolve().parents[1]
    load_dotenv_if_present(project_root / ".env")
    args = parse_args()

    if args.delay < 0:
        print("❌ --delay darf nicht negativ sein.")
        return 2
    if args.max_retries < 0:
        print("❌ --max-retries darf nicht negativ sein.")
        return 2

    audio_ids = resolve_audio_ids(args)
    if not audio_ids:
        print("⚠️ Keine Audio-IDs gefunden. Nutze --all oder --audio-id <id>.")
        return 0

    if args.prompt_file and len(audio_ids) != 1:
        print("❌ --prompt-file kann nur mit genau einer --audio-id verwendet werden.")
        return 2

    try:
        api_key = get_api_key()
    except SystemExit as exc:
        print(exc)
        return 2

    client = genai.Client(api_key=api_key)
    grand = GenerationStats()

    for audio_id in audio_ids:
        prompt_file = resolve_prompt_file(audio_id, args.prompt_file)
        if not prompt_file.is_absolute():
            prompt_file = (project_root / prompt_file).resolve()

        try:
            prompts = load_prompts_json(prompt_file, requested_slides=args.slides)
        except Exception as exc:  # noqa: BLE001
            print(f"❌ Vorbereitung fehlgeschlagen für {audio_id}: {exc}")
            return 2

        stats = generate_for_audio_id(
            client=client,
            audio_id=audio_id,
            prompts=prompts,
            model=args.model,
            delay_seconds=args.delay,
            max_retries=args.max_retries,
            force=args.force,
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
