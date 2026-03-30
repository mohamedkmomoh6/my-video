import os
import json
import re

PUBLIC_DIR = "./public"
SCRIPTS_DIR = "./scripts"

def clean_text(text):
    # Entfernt überschüssige Leerzeichen und normalisiert Zeilenumbrüche
    return text.strip().split()

def sync_all():
    json_files = [f for f in os.listdir(PUBLIC_DIR) if f.endswith('.json')]
    
    for j_file in json_files:
        base_name = os.path.splitext(j_file)[0]
        script_path = os.path.join(SCRIPTS_DIR, f"{base_name}.txt")
        json_path = os.path.join(PUBLIC_DIR, j_file)
        
        if os.path.exists(script_path):
            with open(script_path, 'r', encoding='utf-8') as f:
                original_words = f.read().split()
            
            with open(json_path, 'r', encoding='utf-8') as f:
                word_data = json.load(f)
            
            # Korrektur-Logik
            # Wir mappen die Original-Wörter auf die Whisper-Zeitstempel
            new_data = []
            for i, word_obj in enumerate(word_data):
                if i < len(original_words):
                    word_obj['text'] = original_words[i]
                    new_data.append(word_obj)
                else:
                    # Whisper hat mehr Wörter gefunden als im Skript stehen? 
                    # Behalten wir sie vorerst bei oder löschen sie (je nach Wunsch)
                    pass 
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, ensure_ascii=False, indent=2)
            print(f"✅ Synchronisiert: {base_name}")

if __name__ == "__main__":
    sync_all()