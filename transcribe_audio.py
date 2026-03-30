import whisper
import json
import os
import shutil
import re

# --- Konfiguration ---
AUDIO_DIR = "./audio_input"
SCRIPTS_DIR = "./scripts"  # NEU: Ordner für deine Original-Texte
OUTPUT_DIR = "./public"     # Hier erwartet Remotion die Assets
WHISPER_MODEL = "base"      # "base", "small" oder "medium" (je nach GPU-Power)

def align_with_original_script(whisper_words, script_path):
    """
    Ersetzt Whisper-Wörter durch den Originaltext aus ElevenLabs,
    behält aber die Zeitstempel bei.
    """
    if not os.path.exists(script_path):
        print(f"⚠️ Kein Original-Skript gefunden unter: {script_path}. Nutze Whisper-Fallback.")
        return whisper_words

    try:
        # 1. Original-Text laden
        with open(script_path, 'r', encoding='utf-8') as f:
            original_text = f.read()
        
        # Text in einzelne Wörter zerlegen (behält Großschreibung/Satzzeichen)
        raw_original_words = original_text.split()
        
        # 2. Sicherheitscheck: Stimmt die Wortanzahl grob überein?
        diff = abs(len(whisper_words) - len(raw_original_words))
        if diff > 5: # Toleranzgrenze von 5 Wörtern
            print(f"🛑 WARNUNG: Wortanzahl weicht stark ab (Whisper: {len(whisper_words)}, Skript: {len(raw_original_words)}).")
            print(f"🛑 Skript-Pfad: {script_path}")
            print("🛑 Breche Ausrichtung ab, um Timing-Fehler zu vermeiden. Nutze Whisper-Original.")
            return whisper_words

        # 3. Wort-für-Wort-Ersatz
        aligned_words = []
        for i, whisper_word_obj in enumerate(whisper_words):
            if i < len(raw_original_words):
                # Wir nehmen das Wort aus dem Skript, behalten aber start/end Zeiten
                aligned_word = {
                    "text": raw_original_words[i], # Originaltext (z.B. "Code")
                    "start": whisper_word_obj['start'],
                    "end": whisper_word_obj['end']
                }
                aligned_words.append(aligned_word)
            else:
                # Fallback, falls Whisper mehr Wörter erkannt hat (darf eigentlich nicht sein)
                aligned_words.append(whisper_word_obj)

        print(f"✅ Transkription erfolgreich gegen Original-Skript ({script_path}) korrigiert.")
        return aligned_words

    except Exception as e:
        print(f"❌ Fehler beim Abgleich mit dem Skript: {e}")
        return whisper_words # Fallback


def transcribe():
    # Ordner-Struktur sicherstellen
    for d in [OUTPUT_DIR, SCRIPTS_DIR]:
        if not os.path.exists(d):
            os.makedirs(d)
            print(f"📁 Ordner erstellt: {d}")
    
    # Lade das Whisper Modell
    print(f"🧠 Lade Whisper Modell '{WHISPER_MODEL}'...")
    model = whisper.load_model(WHISPER_MODEL)
    
    audio_files = [f for f in os.listdir(AUDIO_DIR) if f.endswith('.mp3')]
    
    if not audio_files:
        print(f"⚠️ Keine MP3-Dateien in {AUDIO_DIR} gefunden.")
        return

    for audio in audio_files:
        audio_path = os.path.join(AUDIO_DIR, audio)
        base_name = os.path.splitext(audio)[0]
        script_path = os.path.join(SCRIPTS_DIR, f"{base_name}.txt")
        
        print(f"🎙️ Bearbeite: {audio}...")
        
        # 1. Transkription durchführen (mit Wort-Zeitstempeln)
        print(f"🎙️   Schritt 1: Whisper-Transkription läuft...")
        result = model.transcribe(audio_path, word_timestamps=True, language="de")
        
        whisper_words_data = []
        for segment in result['segments']:
            for word in segment['words']:
                whisper_words_data.append({
                    "text": word['word'].strip(),
                    "start": word['start'],
                    "end": word['end']
                })
        
        # 2. NEU: Abgleich mit Original-Skript (falls vorhanden)
        print(f"🎙️   Schritt 2: Gleiche Transkription mit Original-Skript ab...")
        final_words_data = align_with_original_script(whisper_words_data, script_path)
        
        # 3. JSON im public Ordner speichern
        json_path = os.path.join(OUTPUT_DIR, f"{base_name}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(final_words_data, f, ensure_ascii=False, indent=2)
        print(f"✅ JSON erstellt (bereinigt): {json_path}")

        # 4. AUDIO in den public Ordner kopieren (WICHTIG!)
        dest_audio_path = os.path.join(OUTPUT_DIR, audio)
        shutil.copy2(audio_path, dest_audio_path)
        print(f"📦 Audio kopiert nach: {dest_audio_path}")

if __name__ == "__main__":
    transcribe()