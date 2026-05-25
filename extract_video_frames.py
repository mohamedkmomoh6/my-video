#!/usr/bin/env python3
"""
Extract first frame from MP4 videos and save as PNG.
Useful when Remotion has trouble loading MP4 metadata during rendering.
"""

import os
import subprocess
import sys
from pathlib import Path

def extract_first_frame(mp4_path: str, png_path: str) -> bool:
    """
    Extract the first frame from an MP4 file using ffmpeg.
    Returns True on success, False on failure.
    """
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-i", mp4_path,
                "-vf", "select=eq(n\\,0)",
                "-q:v", "2",
                "-y",  # Overwrite output file
                png_path
            ],
            check=True,
            capture_output=True,
            timeout=30
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"  ❌ Fehler beim Extrahieren: {e}")
        return False

def configure_terminal_encoding() -> None:
    # Ensure stdout/stderr use UTF-8 on Windows to avoid UnicodeEncodeError with emojis
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass

def main():
    configure_terminal_encoding()
    slides_dir = Path("public/slides")
    
    if not slides_dir.exists():
        print(f"❌ Fehler: Ordner '{slides_dir}' nicht gefunden!")
        sys.exit(1)
    
    total_extracted = 0
    total_failed = 0
    
    # Iterate through all per-reel directories
    for reel_dir in sorted(slides_dir.iterdir()):
        if not reel_dir.is_dir():
            continue
        
        print(f"\n📁 Verarbeite {reel_dir.name}...")
        
        # Find all MP4 files
        mp4_files = sorted(reel_dir.glob("slide*.mp4"))
        
        if not mp4_files:
            print(f"  ℹ️  Keine MP4-Dateien gefunden.")
            continue
        
        for mp4_file in mp4_files:
            png_file = mp4_file.with_suffix(".png")
            
            if png_file.exists():
                print(f"  ✓ {png_file.name} existiert bereits")
                continue
            
            print(f"  🎬 Extrahiere Frame aus {mp4_file.name}...", end=" ")
            
            if extract_first_frame(str(mp4_file), str(png_file)):
                size_kb = png_file.stat().st_size / 1024
                print(f"✅ ({size_kb:.1f} KB)")
                total_extracted += 1
            else:
                total_failed += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Extrahiert: {total_extracted}")
    print(f"❌ Fehlgeschlagen: {total_failed}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
