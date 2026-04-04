#!/bin/bash

# Farben für das Terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Preset aus Argument 1 laden (Standard: tiktok)
PRESET=${1:-"tiktok"}
# Temporär deaktiviert: Bildgenerierung erfolgt manuell über die neuen Skripte.
AUTO_GENERATE_IMAGES=false
SLIDE_COUNT=${SLIDE_COUNT:-5}

echo -e "${YELLOW}🚀 Starte die Content-Fabrik: Pre-Flight Check...${NC}"

# Lade optional Variablen aus .env (z. B. SLIDE_COUNT)
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

# Diese Defaults erst NACH dem Laden von .env auflösen,
# damit GOOGLE_IMAGE_MODEL / AUTO_GENERATE_* aus .env wirklich angewendet werden.
AUTO_GENERATE_TIMEOUT_SECONDS=${AUTO_GENERATE_TIMEOUT_SECONDS:-1200}
AUTO_GENERATE_DELAY_SECONDS=${AUTO_GENERATE_DELAY_SECONDS:-8}
AUTO_GENERATE_MAX_RETRIES=${AUTO_GENERATE_MAX_RETRIES:-8}
AUTO_GENERATE_MODEL=${AUTO_GENERATE_MODEL:-${GOOGLE_IMAGE_MODEL:-gemini-3.1-flash-image-preview}}

if [ "$AUTO_GENERATE_IMAGES" = true ] && [ -f "generate_reel_slides.py" ]; then
    echo -e "${YELLOW}🖼️  Auto-Generierung: Erzeuge fehlende Slides via Google API...${NC}"
    gen_args=(
        --all
        --slides "$SLIDE_COUNT"
        --model "$AUTO_GENERATE_MODEL"
        --delay "$AUTO_GENERATE_DELAY_SECONDS"
        --max-retries "$AUTO_GENERATE_MAX_RETRIES"
    )

    if command -v timeout >/dev/null 2>&1; then
        timeout "${AUTO_GENERATE_TIMEOUT_SECONDS}s" python3 -u generate_reel_slides.py "${gen_args[@]}"
    else
        python3 -u generate_reel_slides.py "${gen_args[@]}"
    fi
    gen_exit=$?
    if [ $gen_exit -ne 0 ]; then
        if [ $gen_exit -eq 124 ]; then
            echo -e "${RED}❌ Auto-Generierung hat das Timeout (${AUTO_GENERATE_TIMEOUT_SECONDS}s) erreicht.${NC}"
        fi
        echo -e "${RED}❌ Fehler bei der automatischen Bildgenerierung.${NC}"
        exit 1
    fi
fi

if [ "$AUTO_GENERATE_IMAGES" != true ]; then
    echo -e "${YELLOW}ℹ️  Auto-Bildgenerierung ist deaktiviert. Nutze manuell:${NC}"
    echo -e "   - ${YELLOW}python3 scripts/generate_images_manual_api.py --audio-id <ID>${NC}"
    echo -e "   - ${YELLOW}python3 scripts/animate_slides_wavespeed.py --audio-id <ID>${NC}"
fi

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
        valid_count=0
        missing_indices=()
        for ((i=0; i<SLIDE_COUNT; i++)); do
            if [ -f "public/slides/$base_name/slide${i}.png" ] || [ -f "public/slides/$base_name/slide${i}.mp4" ]; then
                valid_count=$((valid_count + 1))
            else
                missing_indices+=("$i")
            fi
        done

        if [ "$valid_count" -lt "$SLIDE_COUNT" ]; then
            missing_joined=$(IFS=,; echo "${missing_indices[*]}")
            echo -e "  ${RED}❌ Fehler:${NC} Nur $valid_count/$SLIDE_COUNT Slides gefunden (erwartet slideX.png ODER slideX.mp4). Fehlend: [$missing_joined]"
            MISSING_DATA=true
        else
            echo -e "  ${GREEN}✅ $valid_count/$SLIDE_COUNT Slides gefunden (PNG/MP4).${NC}"
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
python3 -u transcribe_audio.py
[[ $? -ne 0 ]] && { echo -e "${RED}❌ Fehler in Schritt 1!${NC}"; exit 1; }

# --- SCHRITT 1.5: Synchronisation & Korrektur (NEU) ---
# Dieser Schritt poliert die JSONs basierend auf deinen .txt Dateien
if [ -f "sync_captions.py" ]; then
    echo -e "${YELLOW}🔧 Schritt 1.5: Synchronisiere Captions mit Original-Texten...${NC}"
    python3 -u sync_captions.py
    [[ $? -ne 0 ]] && { echo -e "${RED}❌ Fehler beim Synchronisieren!${NC}"; exit 1; }
    echo -e "${GREEN}✅ Captions final korrigiert.${NC}"
fi

# --- SCHRITT 2: Rendering ---
echo -e "${YELLOW}🎬 Schritt 2: Starte Video-Rendering mit Preset: $PRESET...${NC}"
python3 -u render_reels.py --preset "$PRESET"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}🔥 BATCH ERFOLGREICH! Check den /out Ordner.${NC}"
    [ -f "./cleanup_reels.sh" ] && ./cleanup_reels.sh
else
    echo -e "\n${RED}❌ Fehler im Rendering-Prozess.${NC}"
    exit 1
fi