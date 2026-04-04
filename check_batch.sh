#!/bin/bash

# Farben für die Übersicht
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Starte Batch-Check für die Nachtschicht...${NC}\n"

cd audio_input
for audio in *.mp3; do
    base_name="${audio%.*}"
    
    echo -e "Prüfe Reel: ${YELLOW}$base_name${NC}"
    
    # 1. Check Script
    if [ -f "../scripts/$base_name.txt" ]; then
        echo -e "  [${GREEN}OK${NC}] Original-Skript (.txt) gefunden."
    else
        echo -e "  [${RED}!!${NC}] Skript fehlt: scripts/$base_name.txt (Whisper-Fallback wird genutzt)"
    fi
    
    # 2. Check Slides-Ordner (PNG oder MP4 pro Index)
    if [ -d "../public/slides/$base_name" ]; then
        expected=5
        valid_count=0
        for ((i=0; i<expected; i++)); do
            if [ -f "../public/slides/$base_name/slide${i}.png" ] || [ -f "../public/slides/$base_name/slide${i}.mp4" ]; then
                valid_count=$((valid_count + 1))
            fi
        done

        if [ "$valid_count" -ge "$expected" ]; then
            echo -e "  [${GREEN}OK${NC}] Slides-Ordner vollständig ($valid_count/$expected als PNG/MP4)."
        else
            echo -e "  [${RED}!!${NC}] Slides unvollständig: $valid_count/$expected gefunden (erwartet slideX.png ODER slideX.mp4)."
        fi
    else
        echo -e "  [${RED}!!${NC}] Bilder-Ordner fehlt: public/slides/$base_name"
    fi
    echo ""
done