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
