import whisper
import json
import os
import shutil
import re
import difflib
from langdetect import detect

# --- Konfiguration ---
AUDIO_DIR = "./audio_input"
SCRIPTS_DIR = "./scripts"  # NEU: Ordner für deine Original-Texte
OUTPUT_DIR = "./public"     # Hier erwartet Remotion die Assets
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")     # "tiny", "base", "small" oder "medium" (je nach GPU-Power)

def read_text_file_robust(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        try:
            with open(path, "r", encoding="cp1252") as f:
                return f.read()
        except UnicodeDecodeError:
            with open(path, "r", encoding="latin-1", errors="replace") as f:
                return f.read()


def detect_language_from_script(script_path):
    """
    Erkennt die Sprache des Original-Skripts automatisch.
    Falls nicht möglich, Fallback auf Deutsch.
    """
    try:
        if os.path.exists(script_path):
            text = read_text_file_robust(script_path)[:500]  # Erste 500 Zeichen für Detektierung
            lang = detect(text)
            # Map ISO-Codes zu Whisper-Sprachcodes
            lang_map = {
                'it': 'it',  # Italienisch
                'de': 'de',  # Deutsch
                'en': 'en',  # Englisch
                'fr': 'fr',  # Französisch
                'es': 'es',  # Spanisch
                'pt': 'pt',  # Portugiesisch
            }
            return lang_map.get(lang, 'de')
    except Exception as e:
        print(f"⚠️ Spracherkennung fehlgeschlagen: {e}")
    return 'de'  # Fallback auf Deutsch

def align_with_original_script(whisper_words, script_path):
    """
    Ersetzt Whisper-Wörter durch den Originaltext aus ElevenLabs,
    behält aber die Zeitstempel bei. Nutzt Sequenz-Alignment um Lücken auszugleichen.
    Funktioniert jetzt auch für italienische und andere Sprachen mit Sonderzeichen.
    """
    if not os.path.exists(script_path):
        print(f"⚠️ Kein Original-Skript gefunden unter: {script_path}. Nutze Whisper-Fallback.")
        return whisper_words

    try:
        # 1. Original-Text laden
        original_text = read_text_file_robust(script_path)
        
        # Text in einzelne Wörter zerlegen
        raw_original_words = original_text.split()
        whisper_texts = [w['text'].strip() for w in whisper_words]
        
        # 2. SequenceMatcher für intelligentes Alignment
        # Nornalisiert für alle Sprachen mit Sonderzeichen (ä, ö, ü, à, è, é, ù, etc.)
        def normalize(w):
            # Entfernt alle Nicht-Buchstaben/Zahlen, aber behält auch andere Alphabete
            return re.sub(r'[^\w]', '', w, flags=re.UNICODE).lower()
            
        whisper_normalized = [normalize(w) for w in whisper_texts]
        original_normalized = [normalize(w) for w in raw_original_words]
        
        # Debugging: Zeige Matching-Erfolg
        matched_count = sum(1 for w, o in zip(whisper_normalized, original_normalized) if w == o)
        print(f"  📊 Matching-Quote: {matched_count}/{len(whisper_normalized)} Wörter aligned ({100*matched_count//max(1,len(whisper_normalized))}%)")
        
        matcher = difflib.SequenceMatcher(None, whisper_normalized, original_normalized)
        
        aligned_words = []
        opcodes = matcher.get_opcodes()
        
        for tag, i1, i2, j1, j2 in opcodes:
            if tag == 'equal' or tag == 'replace':
                # Wir nehmen die exakte Zeitspanne der Whisper-Wörter und verteilen sie gleichmäßig auf die Original-Wörter.
                if i1 < i2:
                    w_start = whisper_words[i1]['start']
                    w_end = whisper_words[i2-1]['end']
                else:
                    w_start = aligned_words[-1]['end'] if aligned_words else 0
                    w_end = w_start + 0.3
                
                duration = max(0.1, w_end - w_start)
                n_orig = j2 - j1
                
                if n_orig > 0:
                    time_per_word = duration / n_orig
                    for k in range(n_orig):
                        aligned_words.append({
                            "text": raw_original_words[j1 + k],
                            "start": round(w_start + k * time_per_word, 2),
                            "end": round(w_start + (k + 1) * time_per_word, 2)
                        })
            elif tag == 'insert':
                # Wörter im Original-Skript, die Whisper verschluckt hat
                last_end = aligned_words[-1]['end'] if aligned_words else 0
                for k in range(j1, j2):
                    aligned_words.append({
                        "text": raw_original_words[k],
                        "start": round(last_end, 2),
                        "end": round(last_end + 0.3, 2)
                    })
                    last_end += 0.3
            elif tag == 'delete':
                # Whisper hat "Husten" oder Wiederholungen transkribiert, die nicht im Skript stehen -> ignorieren.
                pass

        print(f"✅ Transkription erfolgreich gegen Original-Skript ({script_path}) mittels difflib korrigiert.")
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
        
        # 0. Sprache des Original-Skripts erkennen
        detected_language = detect_language_from_script(script_path)
        print(f"🌍 Erkannte Sprache: {detected_language}")
        
        # 1. Transkription durchführen (mit Wort-Zeitstempeln)
        print(f"🎙️   Schritt 1: Whisper-Transkription läuft...")
        result = model.transcribe(audio_path, word_timestamps=True, language=detected_language)
        
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
        
        # 5. Verifizierung: Zeige erste 3 Einträge der JSON
        print(f"📝 Erste 3 Caption-Einträge:")
        for i, word_data in enumerate(final_words_data[:3]):
            print(f"   [{i}] {word_data['text']} (start: {word_data['start']}s, end: {word_data['end']}s)")

if __name__ == "__main__":
    transcribe()