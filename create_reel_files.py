#!/usr/bin/env python3
import os
from pathlib import Path

def main():
    print("=== ReelIT Dateigenerator ===")
    
    # 1. Eingabe der Startnummer
    while True:
        try:
            start_input = input("Startnummer (z. B. 28): ").strip()
            start_num = int(start_input)
            if start_num < 0:
                print("❌ Bitte eine positive Zahl eingeben.")
                continue
            break
        except ValueError:
            print("❌ Ungültige Eingabe. Bitte eine Zahl eingeben.")
            
    # 2. Eingabe der Endnummer
    while True:
        try:
            end_input = input("Endnummer (z. B. 30): ").strip()
            end_num = int(end_input)
            if end_num < start_num:
                print(f"❌ Die Endnummer muss größer oder gleich der Startnummer ({start_num}) sein.")
                continue
            break
        except ValueError:
            print("❌ Ungültige Eingabe. Bitte eine Zahl eingeben.")

    # Zielverzeichnis ermitteln
    script_dir = Path(__file__).resolve().parent
    if script_dir.name == "scripts":
        target_dir = script_dir
    else:
        target_dir = script_dir / "scripts"
        
    if not target_dir.exists():
        os.makedirs(target_dir, exist_ok=True)
        print(f"📁 Zielordner '{target_dir}' wurde erstellt.")

    print(f"\nErstelle Dateien für den Bereich {start_num} bis {end_num} in '{target_dir}'...\n")

    created_count = 0
    skipped_count = 0

    for num in range(start_num, end_num + 1):
        # Formatierung auf 3 Stellen mit führenden Nullen (z.B. 028)
        num_str = f"{num:03d}"
        
        filenames = [
            f"ReelIT{num_str}.prompts.json",
            f"ReelIT{num_str}.prompts.video.json",
            f"ReelIT{num_str}.txt"
        ]
        
        for name in filenames:
            file_path = target_dir / name
            if file_path.exists():
                print(f"⚠️ Übersprungen: {name} (existiert bereits)")
                skipped_count += 1
            else:
                file_path.touch()
                print(f"✅ Erstellt: {name}")
                created_count += 1

    print(f"\n🎉 Fertig! {created_count} Dateien erfolgreich erstellt, {skipped_count} übersprungen.")

if __name__ == "__main__":
    main()
