export const PRIMARY = '#FFD700';
export const BACKGROUND = '#000000';
export const TEXT_MAIN = '#FFFFFF';

// Style #1: Performance Optimizer (Standard-Branding)
export const PERFORMANCE_OPTIMIZER_ACCENT_CYAN = '#00D4FF';
export const PERFORMANCE_OPTIMIZER_ACCENT_GREEN = '#39FF14';
export const PERFORMANCE_OPTIMIZER_TEXT_SECONDARY = '#F0F0F0';

export const getAccentColorByPreset = (preset?: string): string => {
	if (preset === 'performanceOptimizer') {
		return PERFORMANCE_OPTIMIZER_ACCENT_CYAN;
	}

	return PRIMARY;
};

// TikTok Reel Safezones (1080x1920 Baseline)
// Diese Bereiche halten UI-Elemente von App-Overlays fern.
export const TIKTOK_SAFEZONE_TOP_PX = 220;
export const TIKTOK_SAFEZONE_BOTTOM_PX = 340;
export const TIKTOK_SAFEZONE_SIDE_PX = 72;
