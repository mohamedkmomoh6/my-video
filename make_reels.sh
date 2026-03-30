#!/bin/bash

# Farben für das Terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Preset aus Argument 1 laden (Standard: tiktok)
PRESET=${1:-"tiktok"}

echo -e "${YELLOW}🚀 Starte die Content-Fabrik: Pre-Flight Check...${NC}"

# --- SCHRITT 0: Validierung der Batch-Daten ---
MISSING_DATA=false
STRICT_MODE=true # Auf 'true' setzen, wenn Reels OHNE .txt Skript NICHT gerendert werden sollen

mkdir -p scripts audio_input public/slides out

for audio in audio_input/*.mp3; do
    [ -e "$audio" ] || { echo -e "${RED}⚠️ Keine MP3-Dateien gefunden!${NC}"; exit 1; }
    
    base_name=$(basename "$audio" .mp3)
    echo -e "Prüfe Reel: ${YELLOW}$base_name${NC}"
    
    # Check 1: Original-Skript
    if [ ! -f "scripts/$base_name.txt" ]; then
        if [ "$STRICT_MODE" = true ]; then
            echo -e "  ${RED}❌ Fehler:${NC} Skript 'scripts/$base_name.txt' fehlt (Strict Mode aktiv)!"
            MISSING_DATA=true
        else
            echo -e "  ${RED}⚠️ Warnung:${NC} Kein Skript gefunden. Nutze Whisper-Original."
        fi
    else
        echo -e "  ${GREEN}✅ Skript gefunden.${NC}"
    fi
    
    # Check 2: Bilder-Ordner
    if [ ! -d "public/slides/$base_name" ]; then
        echo -e "  ${RED}❌ Fehler:${NC} Bilder-Ordner 'public/slides/$base_name' fehlt!"
        MISSING_DATA=true
    else
        file_count=$(ls -1 "public/slides/$base_name" | wc -l)
        if [ "$file_count" -lt 5 ]; then
            echo -e "  ${RED}❌ Fehler:${NC} Nur $file_count Bilder (5 benötigt)."
            MISSING_DATA=true
        else
            echo -e "  ${GREEN}✅ Bilder bereit.${NC}"
        fi
    fi
done

if [ "$MISSING_DATA" = true ]; then
    echo -e "\n${RED}🛑 Abbruch: Daten unvollständig.${NC}"
    exit 1
fi

# --- Bestätigung ---
SKIP_CONFIRM=false
[[ "$*" == *"--yes"* ]] || [[ "$*" == *"-y"* ]] && SKIP_CONFIRM=true

if [ "$SKIP_CONFIRM" = false ]; then
    echo -e "\n${GREEN}✨ Alle Daten sind bereit.${NC}"
    read -p "Möchtest du die Nachtschicht starten? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && { echo -e "${YELLOW}Abgebrochen.${NC}"; exit 1; }
fi

# --- SCHRITT 1: Transkription ---
echo -e "${YELLOW}🎙️  Schritt 1: Transkribiere Audios mit Whisper...${NC}"
python3 transcribe_audio.py
[[ $? -ne 0 ]] && { echo -e "${RED}❌ Fehler in Schritt 1!${NC}"; exit 1; }

# --- SCHRITT 1.5: Synchronisation & Korrektur (NEU) ---
# Dieser Schritt poliert die JSONs basierend auf deinen .txt Dateien
if [ -f "sync_captions.py" ]; then
    echo -e "${YELLOW}🔧 Schritt 1.5: Synchronisiere Captions mit Original-Texten...${NC}"
    python3 sync_captions.py
    [[ $? -ne 0 ]] && { echo -e "${RED}❌ Fehler beim Synchronisieren!${NC}"; exit 1; }
    echo -e "${GREEN}✅ Captions final korrigiert.${NC}"
fi

# --- SCHRITT 2: Rendering ---
echo -e "${YELLOW}🎬 Schritt 2: Starte Video-Rendering mit Preset: $PRESET...${NC}"
python3 render_reels.py --preset "$PRESET"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}🔥 BATCH ERFOLGREICH! Check den /out Ordner.${NC}"
    [ -f "./cleanup_reels.sh" ] && ./cleanup_reels.sh
else
    echo -e "\n${RED}❌ Fehler im Rendering-Prozess.${NC}"
    exit 1
fi