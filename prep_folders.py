import os

# Pfade definieren
AUDIO_DIR = "./audio_input"
SLIDES_BASE_DIR = "./public/slides"

def prepare_batch_folders():
    # Sicherstellen, dass der Basis-Ordner existiert
    if not os.path.exists(SLIDES_BASE_DIR):
        os.makedirs(SLIDES_BASE_DIR)
        print(f"📁 Basis-Ordner erstellt: {SLIDES_BASE_DIR}")

    # Alle MP3s im Eingabe-Ordner finden
    audio_files = [f for f in os.listdir(AUDIO_DIR) if f.endswith('.mp3')]
    
    if not audio_files:
        print("⚠️ Keine MP3-Dateien in ./audio_input gefunden.")
        return

    for audio in audio_files:
        # Dateiname ohne Endung als Ordnername
        folder_name = os.path.splitext(audio)[0]
        target_path = os.path.join(SLIDES_BASE_DIR, folder_name)

        if not os.path.exists(target_path):
            os.makedirs(target_path)
            print(f"✅ Ordner erstellt für: {folder_name}")
        else:
            print(f"ℹ️ Ordner existiert bereits: {folder_name}")

if __name__ == "__main__":
    prepare_batch_folders()