# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

## Caption style presets (TikTok / Instagram / Custom)

This project supports flexible caption style presets.

- Select a preset by name using `captionStylePreset`
- Toggle extreme single-word autoscaling using `autoScaleExtremeWords`
- (Optional) pass your own preset map via `captionStylePresets`

Built-in presets currently include:

- `tiktok`
- `instagram`
- `youtubeShorts`

### Quick example (built-in preset)

```console
npx remotion render MyVideo out.mp4 --props='{"audioID":"de_hook_ai_01","speedMode":"balanced","captionStylePreset":"tiktok","autoScaleExtremeWords":true}'
```

### Quick example (switch to another built-in preset)

```console
npx remotion render MyVideo out.mp4 --props='{"audioID":"de_hook_ai_01","speedMode":"balanced","captionStylePreset":"youtubeShorts","autoScaleExtremeWords":true}'
```

### Custom preset map example

```console
npx remotion render MyVideo out.mp4 --props='{"audioID":"de_hook_ai_01","speedMode":"balanced","captionStylePreset":"brandBlue","captionStylePresets":{"brandBlue":{"sidePaddingPct":0.09,"sidePaddingMin":40,"sidePaddingMax":100,"fontScale":0.064,"fontMin":48,"fontMax":86,"lineHeight":1.08,"maxLines":3,"maxWidth":"86%","tokenGapEm":0.15}},"autoScaleExtremeWords":true}'
```

Tip: Default presets live in `src/caption-style-presets.ts`.

## Mixed slide backgrounds (PNG + MP4)

You can now use images and videos as slide backgrounds with the same timing / transitions behavior.

- Place assets in `public/slides/<folder>/`
- Name files per index:
  - image: `slide0.png`
  - video: `slide1.mp4`
- Mixed mode is supported (for example: `slide0.png`, `slide1.mp4`, `slide2.png`)

Auto-detection behavior per slide index:

1. Use `slide{index}.mp4` if present
2. Otherwise use `slide{index}.png`
3. Throw an error if neither file exists

Optional explicit override via props:

```console
npx remotion render MyVideo out.mp4 --props='{"audioID":"ReelIT001","imageFolder":"slides/ReelIT001","slideCount":6,"slideTypes":["image","video","image","video","image","video"],"applyKenBurnsToVideos":false}'
```

Notes:

- Ken Burns for images remains active (unchanged).
- Videos loop automatically if they are shorter than the slide duration.
- Ken Burns for video slides is enabled by default **only after playback ends** (held end-frame when `loopVideos` is `false`).
- During active MP4 playback, no Ken-Burns transform is applied.
- Set `applyKenBurnsToVideos: false` if you want static video framing.

## Manual slide generation (images + videos)

For step-by-step instructions on manually generating slides:

**👉 See: [MANUAL_GENERATION_GUIDE.md](MANUAL_GENERATION_GUIDE.md)**

This guide covers:
1. Preparing JSON prompts
2. Generating PNG slides via Google Gemini Image API
3. Animating slides into MP4 videos via WaveSpeed
4. Workflow examples and error handling

## Manual WaveSpeed image→video (standalone script)

This repo includes a manual helper script for converting `slideX.png` files into `slideX.mp4` using WaveSpeed.

- Script: `scripts/animate_slides_wavespeed.py`
- It is **not** integrated into `make_reels.sh` (manual usage only).
- Prompt source: `scripts/<audioID>.prompts.json`
- Output target: `public/slides/<audioID>/slideX.mp4`

### JSON format

Expected structure:

```json
{
  "prompts": [
    "Slide0: ...",
    "Slide1: ..."
  ]
}
```

Notes:

- `prompts` must be a non-empty array of non-empty strings.
- Missing/invalid prompt JSON causes a fail-fast abort.
- **File location: `scripts/<audioID>.prompts.video.json`** (separate from image prompts at `.prompts.json`)

### Requirements

- Set your API key in `.env` (or environment):
  - `WAVESPEED_API_KEY=...`
  - or `WAVE_SPEED_API_KEY=...`

### Default generation settings

- model: `bytedance/seedance-v1.5-pro/image-to-video`
- aspect ratio: `9:16`
- resolution: `720p`
- duration: `4` seconds
- generate audio: `false`
- concurrency: `1`
- mode: async submit + polling
- existing `slideX.mp4` files are skipped by default

### Examples

Generate for one reel ID (expects `scripts/ReelIT001.prompts.video.json`):

```console
python3 scripts/animate_slides_wavespeed.py --audio-id ReelIT001
```

Generate all discovered IDs (auto-discovers `*.prompts.video.json`):

```console
python3 scripts/animate_slides_wavespeed.py --all
```

With custom concurrency and force overwrite:

```console
python3 scripts/animate_slides_wavespeed.py \
  --audio-id ReelIT001 \
  --concurrency 2 \
  --duration 4 \
  --resolution 720p \
  --aspect-ratio 9:16 \
  --force
```

## Manual JSON→image generation (standalone script)

This repo includes a manual helper script for generating `slideX.png` files from JSON prompts via Google Gemini Image API.

- Script: `scripts/generate_images_manual_api.py`
- It is **not** integrated into `make_reels.sh` (manual usage only).
- Prompt source: `scripts/<audioID>.prompts.json`
- Output target: `public/slides/<audioID>/slideX.png`

### JSON format

Expected structure:

```json
{
  "prompts": [
    "Slide0: ...",
    "Slide1: ..."
  ]
}
```

Notes:

- `prompts` must be a non-empty array of non-empty strings.
- Missing/invalid prompt JSON causes a fail-fast abort.

### Requirements

- Set API key in `.env` (or environment):
  - `NANO_BANANA_API_KEY=...`
  - or `GOOGLE_API_KEY=...`

### Examples

Generate for one reel ID:

```console
python3 scripts/generate_images_manual_api.py --audio-id ReelIT001
```

Generate all discovered IDs (`audio_input/*.mp3` and `scripts/*.prompts.json`):

```console
python3 scripts/generate_images_manual_api.py --all
```

Use only first 6 prompts and overwrite existing PNGs:

```console
python3 scripts/generate_images_manual_api.py --audio-id ReelIT001 --slides 6 --force
```

Use a custom JSON file (single audio-id only):

```console
python3 scripts/generate_images_manual_api.py \
  --audio-id ReelIT001 \
  --prompt-file ./scripts/ReelIT001.prompts.json
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
