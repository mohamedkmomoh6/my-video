#!/bin/bash

# Farben für das Terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🧹 Starte selektive Reinigung des Arbeitsverzeichnisses...${NC}"

# 1. Alle JSON-Dateien löschen (da diese immer temporär sind)
find ./public -maxdepth 1 -type f -name "*.json" -delete

# 2. Nur MP3s löschen, die auch im audio_input existieren (Voiceover)
# Dadurch bleibt eine 'music.mp3' oder 'background.mp3' erhalten.
for audio in audio_input/*.mp3; do
    base_name=$(basename "$audio")
    if [ -f "./public/$base_name" ]; then
        rm "./public/$base_name"
        # echo -e "  Entferne Voiceover: $base_name"
    fi
done

echo -e "${GREEN}✅ Cleanup abgeschlossen. Musik & Slides wurden verschont!${NC}"