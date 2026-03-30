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
    
    # 2. Check Bilder-Ordner
    if [ -d "../public/slides/$base_name" ]; then
        file_count=$(ls -1 "../public/slides/$base_name" | wc -l)
        if [ "$file_count" -ge 5 ]; then
            echo -e "  [${GREEN}OK${NC}] Bilder-Ordner gefunden ($file_count Dateien)."
        else
            echo -e "  [${RED}!!${NC}] Bilder-Ordner hat nur $file_count Dateien (5 benötigt)."
        fi
    else
        echo -e "  [${RED}!!${NC}] Bilder-Ordner fehlt: public/slides/$base_name"
    fi
    echo ""
done