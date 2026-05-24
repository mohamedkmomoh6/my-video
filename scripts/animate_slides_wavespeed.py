#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import error, request

DEFAULT_API_BASE = "https://api.wavespeed.ai/api/v3"
DEFAULT_MODEL = "bytedance/seedance-v1.5-pro/image-to-video"
DEFAULT_ASPECT_RATIO = "9:16"
DEFAULT_RESOLUTION = "720p"
DEFAULT_DURATION = 4
DEFAULT_GENERATE_AUDIO = False
DEFAULT_CONCURRENCY = 1
DEFAULT_POLL_INTERVAL = 5.0
DEFAULT_POLL_TIMEOUT = 900.0
DEFAULT_UPLOAD_TIMEOUT = 120.0
DEFAULT_HTTP_TIMEOUT = 60.0

AUDIO_DIR = "./audio_input"
SCRIPTS_DIR = "./scripts"
SLIDES_BASE_DIR = "./public/slides"

SLIDE_KEY_PATTERN = re.compile(r"^slide\s*(\d+)$", re.IGNORECASE)


@dataclass(frozen=True)
class SlideJob:
    index: int
    image_path: Path
    output_path: Path
    prompt: str


@dataclass
class JobResult:
    index: int
    status: str
    message: str


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
    api_key = os.getenv("WAVESPEED_API_KEY") or os.getenv("WAVE_SPEED_API_KEY")
    if not api_key:
        raise SystemExit(
            "❌ Kein WaveSpeed API-Key gefunden. Setze WAVESPEED_API_KEY (oder WAVE_SPEED_API_KEY) in .env oder als Umgebungsvariable."
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
            if file.is_file() and file.name.endswith(".prompts.video.json"):
                audio_ids.add(file.name[: -len(".prompts.video.json")])

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
    if isinstance(data, list):
        # Unterstützt folgende Listenformate:
        # 1) ["prompt1", "prompt2", ...]
        # 2) [{"slide": 1, "prompt": "..."}, ...]
        if all(isinstance(item, str) for item in data):
            prompts = _validate_prompt_entries(data, source_path, "prompts")
            return prompts, True

        if not all(isinstance(item, dict) for item in data):
            raise ValueError(
                f"Ungültiges JSON in {source_path}: Listenformat muss nur Strings oder Objekte mit 'prompt' enthalten."
            )

        entries = []
        has_any_slide = False
        has_all_slides = True

        for idx, item in enumerate(data):
            prompt_raw = item.get("prompt") if isinstance(item, dict) else None
            if not isinstance(prompt_raw, str):
                raise ValueError(
                    f"Ungültiger Prompt in {source_path}: list[{idx}].prompt fehlt oder ist kein String."
                )

            prompt = prompt_raw.strip()
            if not prompt:
                raise ValueError(f"Ungültiger Prompt in {source_path}: list[{idx}].prompt ist leer.")

            slide_value = item.get("slide") if isinstance(item, dict) else None
            slide_number: Optional[int] = None
            if slide_value is None:
                has_all_slides = False
            else:
                has_any_slide = True
                if isinstance(slide_value, int):
                    slide_number = slide_value
                elif isinstance(slide_value, str) and slide_value.strip().isdigit():
                    slide_number = int(slide_value.strip())
                else:
                    raise ValueError(
                        f"Ungültiger Slide-Wert in {source_path}: list[{idx}].slide muss Zahl oder Zahlen-String sein."
                    )

            entries.append((idx, slide_number, prompt))

        if not entries:
            raise ValueError(f"Ungültiges JSON in {source_path}: Prompt-Liste darf nicht leer sein.")

        # Falls alle Einträge eine Slide-Nummer haben, deterministisch danach sortieren.
        # Sonst ursprüngliche Reihenfolge beibehalten.
        if has_any_slide and has_all_slides:
            entries.sort(key=lambda item: (item[1], item[0]))

        prompts = [prompt for _, __, prompt in entries]
        return prompts, True

    if not isinstance(data, dict):
        raise ValueError(
            f"Ungültiges JSON in {source_path}: Erwartet entweder Objekt (prompts/SlideX) oder Liste (Strings bzw. Objekte mit 'prompt')."
        )

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


def load_prompts_json(prompt_file: Path) -> List[str]:
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

    return prompts


def build_jobs(
    target_dir: Path,
    prompts: List[str],
    force: bool,
) -> tuple[List[SlideJob], int]:
    target_dir.mkdir(parents=True, exist_ok=True)

    jobs: List[SlideJob] = []
    skipped_existing = 0

    for index, prompt in enumerate(prompts):
        image_path = target_dir / f"slide{index}.png"
        output_path = target_dir / f"slide{index}.mp4"

        # Fail-fast: Bild muss existieren
        if not image_path.exists():
            raise ValueError(
                f"Startbild fehlt: {image_path}. "
                f"Bitte zuerst mit `generate_images_manual_api.py` Bilder erzeugen."
            )

        if output_path.exists() and not force:
            skipped_existing += 1
            continue

        jobs.append(
            SlideJob(
                index=index,
                image_path=image_path,
                output_path=output_path,
                prompt=prompt,
            )
        )

    return jobs, skipped_existing


def _json_dumps(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def http_json(
    url: str,
    method: str,
    headers: Dict[str, str],
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = DEFAULT_HTTP_TIMEOUT,
) -> Dict[str, Any]:
    body = _json_dumps(payload) if payload is not None else None
    req = request.Request(url=url, data=body, method=method.upper())

    for k, v in headers.items():
        req.add_header(k, v)

    if body is not None and "Content-Type" not in headers:
        req.add_header("Content-Type", "application/json")

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"raw": raw}
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} @ {url}: {raw}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Netzwerkfehler @ {url}: {exc}") from exc


def http_multipart_upload(
    url: str,
    headers: Dict[str, str],
    file_path: Path,
    field_name: str = "file",
    timeout: float = DEFAULT_UPLOAD_TIMEOUT,
) -> Dict[str, Any]:
    boundary = f"----WaveSpeedBoundary{uuid.uuid4().hex}"

    preamble = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{file_path.name}"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode("utf-8")
    epilogue = f"\r\n--{boundary}--\r\n".encode("utf-8")

    body = preamble + file_path.read_bytes() + epilogue

    req = request.Request(url=url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Accept", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"raw": raw}
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} @ {url}: {raw}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Netzwerkfehler @ {url}: {exc}") from exc


def find_first_url(data: Any) -> Optional[str]:
    if isinstance(data, str):
        if data.startswith("http://") or data.startswith("https://"):
            return data
        return None

    if isinstance(data, dict):
        preferred_keys = (
            "url",
            "file_url",
            "media_url",
            "video_url",
            "download_url",
            "oss_url",
        )
        for key in preferred_keys:
            value = data.get(key)
            found = find_first_url(value)
            if found:
                return found

        for value in data.values():
            found = find_first_url(value)
            if found:
                return found

    if isinstance(data, list):
        for item in data:
            found = find_first_url(item)
            if found:
                return found

    return None


def upload_image(api_base: str, api_key: str, image_path: Path, timeout: float) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    endpoints = (
        f"{api_base}/upload",
        f"{api_base}/media/upload/binary",
    )

    errors_seen: List[str] = []
    for endpoint in endpoints:
        try:
            resp = http_multipart_upload(
                url=endpoint,
                headers=headers,
                file_path=image_path,
                timeout=timeout,
            )
            uploaded_url = find_first_url(resp)
            if uploaded_url:
                return uploaded_url
            errors_seen.append(f"{endpoint}: keine URL in Antwort ({resp})")
        except Exception as exc:  # noqa: BLE001
            errors_seen.append(f"{endpoint}: {exc}")

    raise RuntimeError("Upload fehlgeschlagen. Details: " + " | ".join(errors_seen))


def _extract_task_id(resp: Dict[str, Any]) -> Optional[str]:
    candidates: List[Any] = [
        resp.get("id"),
        resp.get("task_id"),
        resp.get("requestId"),
        resp.get("request_id"),
    ]

    data = resp.get("data")
    if isinstance(data, dict):
        candidates.extend([data.get("id"), data.get("task_id"), data.get("requestId")])

    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def submit_generation(
    api_base: str,
    api_key: str,
    model: str,
    image_url: str,
    prompt: str,
    aspect_ratio: str,
    resolution: str,
    duration: int,
    generate_audio: bool,
    camera_fixed: Optional[bool],
    seed: Optional[int],
    timeout: float,
) -> str:
    url = f"{api_base}/{model}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "image": image_url,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "duration": duration,
        "generate_audio": generate_audio,
    }
    if camera_fixed is not None:
        payload["camera_fixed"] = camera_fixed
    if seed is not None:
        payload["seed"] = seed

    resp = http_json(url=url, method="POST", headers=headers, payload=payload, timeout=timeout)
    task_id = _extract_task_id(resp)
    if not task_id:
        raise RuntimeError(f"Konnte keine Task-ID aus Submit-Antwort lesen: {resp}")
    return task_id


def _extract_status(resp: Dict[str, Any]) -> str:
    for key in ("status", "state"):
        value = resp.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()

    data = resp.get("data")
    if isinstance(data, dict):
        for key in ("status", "state"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip().lower()

    return "unknown"


def _extract_video_url(resp: Dict[str, Any]) -> Optional[str]:
    candidates: List[Any] = [
        resp.get("result"),
        resp.get("output"),
        resp.get("data"),
        resp,
    ]

    for candidate in candidates:
        found = find_first_url(candidate)
        if found and (".mp4" in found.lower() or "video" in found.lower()):
            return found

    for candidate in candidates:
        found = find_first_url(candidate)
        if found:
            return found

    return None


def poll_result(
    api_base: str,
    api_key: str,
    task_id: str,
    poll_interval: float,
    poll_timeout: float,
    timeout: float,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    endpoint_candidates = (
        f"{api_base}/predictions/{task_id}/result",
        f"{api_base}/predictions/{task_id}",
    )

    deadline = time.time() + poll_timeout
    last_status = "created"

    while True:
        if time.time() > deadline:
            raise TimeoutError(f"Polling-Timeout erreicht ({poll_timeout}s), letzter Status: {last_status}")

        last_error: Optional[Exception] = None
        for endpoint in endpoint_candidates:
            try:
                resp = http_json(url=endpoint, method="GET", headers=headers, timeout=timeout)
                status = _extract_status(resp)
                if status != "unknown":
                    last_status = status

                if status in {"completed", "succeeded", "success"}:
                    video_url = _extract_video_url(resp)
                    if not video_url:
                        raise RuntimeError(f"Task abgeschlossen, aber keine Video-URL in Antwort: {resp}")
                    return video_url

                if status in {"failed", "error", "canceled", "cancelled"}:
                    raise RuntimeError(f"Task fehlgeschlagen (Status: {status}): {resp}")

                last_error = None
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc

        if last_error is not None:
            raise RuntimeError(f"Abruf von Task {task_id} fehlgeschlagen: {last_error}")

        time.sleep(poll_interval)


def download_file(url: str, destination: Path, timeout: float) -> None:
    req = request.Request(url=url, method="GET")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Download-HTTP {exc.code} @ {url}: {raw}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Download-Netzwerkfehler @ {url}: {exc}") from exc

    destination.write_bytes(data)


def process_job(
    job: SlideJob,
    api_base: str,
    api_key: str,
    model: str,
    aspect_ratio: str,
    resolution: str,
    duration: int,
    generate_audio: bool,
    camera_fixed: Optional[bool],
    seed: Optional[int],
    upload_timeout: float,
    http_timeout: float,
    poll_interval: float,
    poll_timeout: float,
) -> JobResult:
    try:
        print(f"  🎬 slide{job.index}: Upload startet...")
        image_url = upload_image(api_base=api_base, api_key=api_key, image_path=job.image_path, timeout=upload_timeout)

        print(f"  🚀 slide{job.index}: Generation submit...")
        task_id = submit_generation(
            api_base=api_base,
            api_key=api_key,
            model=model,
            image_url=image_url,
            prompt=job.prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration=duration,
            generate_audio=generate_audio,
            camera_fixed=camera_fixed,
            seed=seed,
            timeout=http_timeout,
        )

        print(f"  ⏳ slide{job.index}: Polling task={task_id}...")
        video_url = poll_result(
            api_base=api_base,
            api_key=api_key,
            task_id=task_id,
            poll_interval=poll_interval,
            poll_timeout=poll_timeout,
            timeout=http_timeout,
        )

        download_file(video_url, job.output_path, timeout=http_timeout)
        return JobResult(index=job.index, status="ok", message=f"Gespeichert: {job.output_path}")

    except Exception as exc:  # noqa: BLE001
        return JobResult(index=job.index, status="failed", message=str(exc))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Manuelle WaveSpeed Bild→Video Generierung aus JSON-Prompts. "
            "Erwartet scripts/<audioID>.prompts.video.json (unterstützt: {'prompts': [...]}, {'Slide0': '...'}, "
            "['...'], [{'slide': 1, 'prompt': '...'}]) und erzeugt slideX.mp4 in public/slides/<audioID>/."
        )
    )

    parser.add_argument("--audio-id", dest="audio_ids", action="append", help="Audio-ID (Dateiname ohne .mp3). Kann mehrfach genutzt werden.")
    parser.add_argument("--all", action="store_true", help="Für alle verfügbaren Audio-IDs.")

    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help=f"WaveSpeed API Base URL (Default: {DEFAULT_API_BASE})")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model-ID (Default: {DEFAULT_MODEL})")

    parser.add_argument("--aspect-ratio", default=DEFAULT_ASPECT_RATIO, help=f"Aspect Ratio (Default: {DEFAULT_ASPECT_RATIO})")
    parser.add_argument("--resolution", default=DEFAULT_RESOLUTION, help=f"Resolution (Default: {DEFAULT_RESOLUTION})")
    parser.add_argument("--duration", type=int, default=DEFAULT_DURATION, help=f"Dauer in Sekunden (Default: {DEFAULT_DURATION})")

    parser.add_argument("--generate-audio", action="store_true", default=DEFAULT_GENERATE_AUDIO, help="Audio im Video erzeugen (Default: deaktiviert)")
    parser.add_argument("--camera-fixed", action="store_true", help="Kamera fixieren (optional)")
    parser.add_argument("--seed", type=int, default=None, help="Optionaler Seed")

    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help=f"Parallele Jobs (Default: {DEFAULT_CONCURRENCY})")
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL, help=f"Polling-Intervall Sekunden (Default: {DEFAULT_POLL_INTERVAL})")
    parser.add_argument("--poll-timeout", type=float, default=DEFAULT_POLL_TIMEOUT, help=f"Timeout pro Task Sekunden (Default: {DEFAULT_POLL_TIMEOUT})")
    parser.add_argument("--upload-timeout", type=float, default=DEFAULT_UPLOAD_TIMEOUT, help=f"Upload Timeout Sekunden (Default: {DEFAULT_UPLOAD_TIMEOUT})")
    parser.add_argument("--http-timeout", type=float, default=DEFAULT_HTTP_TIMEOUT, help=f"HTTP Timeout Sekunden (Default: {DEFAULT_HTTP_TIMEOUT})")

    parser.add_argument("--force", action="store_true", help="Existierende slideX.mp4 überschreiben")

    return parser.parse_args()


def main() -> int:
    configure_output_buffering()

    project_root = Path(__file__).resolve().parents[1]
    load_dotenv_if_present(project_root / ".env")

    try:
        api_key = get_api_key()
    except SystemExit as exc:
        print(exc)
        return 2

    args = parse_args()

    if args.duration < 1:
        print("❌ --duration muss mindestens 1 sein.")
        return 2
    if args.concurrency < 1:
        print("❌ --concurrency muss mindestens 1 sein.")
        return 2

    audio_ids = args.audio_ids[:] if args.audio_ids else []
    if args.all:
        audio_ids.extend(list_audio_ids())
    audio_ids = sorted(set(audio_ids))

    if not audio_ids:
        print("⚠️ Keine Audio-IDs gefunden. Nutze --all oder --audio-id <id>.")
        return 0

    camera_fixed: Optional[bool] = True if args.camera_fixed else None

    grand = GenerationStats()

    for audio_id in audio_ids:
        prompt_file = (project_root / SCRIPTS_DIR / f"{audio_id}.prompts.video.json").resolve()

        try:
            prompts = load_prompts_json(prompt_file)
        except Exception as exc:  # noqa: BLE001
            print(f"❌ Vorbereitung fehlgeschlagen für {audio_id}: {exc}")
            return 2

        target_dir = (project_root / SLIDES_BASE_DIR / audio_id).resolve()

        try:
            jobs, skipped_existing = build_jobs(target_dir=target_dir, prompts=prompts, force=args.force)
        except Exception as exc:  # noqa: BLE001
            print(f"❌ Vorbereitung Job-List fehlgeschlagen: {exc}")
            return 2

        print(f"\n🎬 Erstelle Animations-Videos für: {audio_id}")
        print(f"   Prompts:        {prompt_file}")
        print(f"   Target:         {target_dir}")
        print(f"   Model:          {args.model}")
        print(f"   Aspect Ratio:   {args.aspect_ratio}")
        print(f"   Resolution:     {args.resolution}")
        print(f"   Duration:       {args.duration}s")
        print(f"   Generate Audio: {args.generate_audio}")
        print(f"   Concurrency:    {args.concurrency}")
        print(f"   Übersprungen:   {skipped_existing}")
        print(f"   Zu generieren:  {len(jobs)}")

        if not jobs:
            print("✅ Nichts zu tun für diese Audio-ID.")
            grand.requested += len(prompts)
            grand.skipped_existing += skipped_existing
            continue

        results: List[JobResult] = []

        if args.concurrency == 1:
            for job in jobs:
                result = process_job(
                    job=job,
                    api_base=args.api_base,
                    api_key=api_key,
                    model=args.model,
                    aspect_ratio=args.aspect_ratio,
                    resolution=args.resolution,
                    duration=args.duration,
                    generate_audio=args.generate_audio,
                    camera_fixed=camera_fixed,
                    seed=args.seed,
                    upload_timeout=args.upload_timeout,
                    http_timeout=args.http_timeout,
                    poll_interval=args.poll_interval,
                    poll_timeout=args.poll_timeout,
                )
                results.append(result)
                if result.status == "ok":
                    print(f"  ✅ slide{result.index}: {result.message}")
                else:
                    print(f"  ❌ slide{result.index}: {result.message}")
        else:
            with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
                future_map = {
                    executor.submit(
                        process_job,
                        job,
                        args.api_base,
                        api_key,
                        args.model,
                        args.aspect_ratio,
                        args.resolution,
                        args.duration,
                        args.generate_audio,
                        camera_fixed,
                        args.seed,
                        args.upload_timeout,
                        args.http_timeout,
                        args.poll_interval,
                        args.poll_timeout,
                    ): job
                    for job in jobs
                }

                for future in as_completed(future_map):
                    result = future.result()
                    results.append(result)
                    if result.status == "ok":
                        print(f"  ✅ slide{result.index}: {result.message}")
                    else:
                        print(f"  ❌ slide{result.index}: {result.message}")

        results.sort(key=lambda item: item.index)
        success_count = sum(1 for item in results if item.status == "ok")
        failed_items = [item for item in results if item.status != "ok"]

        print(f"\n  📊 Ergebnis für {audio_id}")
        print(f"     Erfolgreich:   {success_count}")
        print(f"     Fehlgeschlagen:{len(failed_items)}")
        print(f"     Übersprungen:  {skipped_existing}")

        if failed_items:
            print(f"\n  ❌ Fehlerdetails")
            for item in failed_items:
                print(f"     slide{item.index}: {item.message}")

        grand.requested += len(prompts)
        grand.generated += success_count
        grand.skipped_existing += skipped_existing
        grand.failed += len(failed_items)

    print("\n📊 Gesamtzusammenfassung")
    print(f"   Angefragt:      {grand.requested}")
    print(f"   Neu erzeugt:    {grand.generated}")
    print(f"   Übersprungen:   {grand.skipped_existing}")
    print(f"   Fehlgeschlagen: {grand.failed}")

    return 1 if grand.failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
