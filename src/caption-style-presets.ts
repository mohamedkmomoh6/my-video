export type CaptionStylePresetConfig = {
	sidePaddingPct: number;
	sidePaddingMin: number;
	sidePaddingMax: number;
	fontScale: number;
	fontMin: number;
	fontMax: number;
	lineHeight: number;
	maxLines: number;
	maxWidth: string;
	tokenGapEm: number;
};

export const DEFAULT_CAPTION_STYLE_PRESETS: Record<string, CaptionStylePresetConfig> = {
	tiktok: {
		sidePaddingPct: 0.11,
		sidePaddingMin: 52,
		sidePaddingMax: 120,
		fontScale: 0.072,
		fontMin: 56,
		fontMax: 92,
		lineHeight: 1.06,
		maxLines: 3,
		maxWidth: '88%',
		tokenGapEm: 0.18,
	},
	instagram: {
		sidePaddingPct: 0.1,
		sidePaddingMin: 48,
		sidePaddingMax: 108,
		fontScale: 0.066,
		fontMin: 50,
		fontMax: 84,
		lineHeight: 1.1,
		maxLines: 3,
		maxWidth: '84%',
		tokenGapEm: 0.16,
	},
	youtubeShorts: {
		sidePaddingPct: 0.095,
		sidePaddingMin: 44,
		sidePaddingMax: 96,
		fontScale: 0.062,
		fontMin: 48,
		fontMax: 78,
		lineHeight: 1.12,
		maxLines: 3,
		maxWidth: '82%',
		tokenGapEm: 0.14,
	},
};
