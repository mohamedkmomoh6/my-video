import {
	continueRender,
	delayRender,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';
import {
	type CaptionStylePresetConfig,
	DEFAULT_CAPTION_STYLE_PRESETS,
} from './caption-style-presets';
import {getAccentColorByPreset} from './style-constants';

const {fontFamily, waitUntilDone} = loadFont('normal', {
	weights: ['900'],
});

const handle = delayRender('Montserrat Font - Captions');
waitUntilDone()
	.then(() => {
		continueRender(handle);
	})
	.catch((err) => {
		console.error('Failed to load Montserrat font for Captions:', err);
		continueRender(handle);
	});

let memoizedCanvas: HTMLCanvasElement | null = null;
const getCanvasContext = () => {
	if (typeof window === 'undefined') {
		return null;
	}
	if (!memoizedCanvas) {
		memoizedCanvas = document.createElement('canvas');
	}
	return memoizedCanvas.getContext('2d');
};

const calculatePerfectFontSize = (
	tokens: string[],
	fontName: string,
	maxFontSize: number,
	availableWidthPx: number,
	maxLines: number,
	tokenGapEm: number,
	safetyScale: number
): number => {
	const ctx = getCanvasContext();
	if (!ctx) {
		return maxFontSize;
	}

	let low = 14;
	let high = maxFontSize;
	let bestSize = low;

	for (let iter = 0; iter < 10; iter++) {
		const mid = Math.floor((low + high) / 2);
		ctx.font = `900 ${mid}px "${fontName}", sans-serif`;
		const tokenGapPx = mid * tokenGapEm;

		// Measure all tokens in uppercase (matching CSS textTransform: 'uppercase')
		// and apply the safetyScale factor to account for the pop spring scale animation.
		const tokenWidths = tokens.map(
			(token) => ctx.measureText(token.toUpperCase()).width * safetyScale
		);

		// Check if any single token exceeds the available container width
		const maxTokenWidth = Math.max(...tokenWidths, 0);
		if (maxTokenWidth > availableWidthPx) {
			high = mid - 1;
			continue;
		}

		// Simulate word wrapping (inline-block spans wrapping)
		let currentLineWidth = tokenWidths[0] || 0;
		let lines = 1;
		for (let i = 1; i < tokenWidths.length; i++) {
			if (currentLineWidth + tokenGapPx + tokenWidths[i] <= availableWidthPx) {
				currentLineWidth += tokenGapPx + tokenWidths[i];
			} else {
				lines++;
				currentLineWidth = tokenWidths[i];
			}
		}

		if (lines <= maxLines) {
			bestSize = mid;
			low = mid + 1; // Try larger font size
		} else {
			high = mid - 1; // Too many lines, try smaller font size
		}
	}

	return bestSize;
};

export type CaptionWord = {
	text: string;
	start: number;
	end: number;
};

export type CaptionChunk = CaptionWord & {
	isPowerWord?: boolean;
	words?: CaptionWord[];
};

type CaptionsProps = {
	words: CaptionChunk[];
	chunkWindowSeconds?: number;
	captionStylePreset?: string;
	captionStylePresets?: Record<string, CaptionStylePresetConfig>;
	autoScaleExtremeWords?: boolean;
};

export const Captions: React.FC<CaptionsProps> = ({
	words,
	chunkWindowSeconds = 2,
	captionStylePreset = 'tiktok',
	captionStylePresets,
	autoScaleExtremeWords = true,
}) => {
	const currentFrame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const currentTime = currentFrame / fps;
	const highlightLeadSeconds = 0.04;
	const highlightReferenceTime = currentTime + highlightLeadSeconds;
	const resolvedPresets = {
		...DEFAULT_CAPTION_STYLE_PRESETS,
		...(captionStylePresets ?? {}),
	};
	const preset =
		resolvedPresets[captionStylePreset] ??
		resolvedPresets.tiktok ??
		Object.values(resolvedPresets)[0];
	const sidePadding = Math.max(
		preset.sidePaddingMin,
		Math.min(preset.sidePaddingMax, Math.round(width * preset.sidePaddingPct))
	);
	const shortSide = Math.min(width, height);
	const responsiveFontSize = Math.max(
		preset.fontMin,
		Math.min(preset.fontMax, Math.round(shortSide * preset.fontScale))
	);
	const captionLineHeight = preset.lineHeight;
	const maxCaptionLines = Math.max(1, Math.min(3, preset.maxLines));
	const accentColor = getAccentColorByPreset(captionStylePreset);
	const highlightGlow =
		captionStylePreset === 'performanceOptimizer'
			? `0px 3px 6px rgba(0, 0, 0, 0.9), 0 0 18px ${accentColor}AA`
			: '0px 3px 6px rgba(0, 0, 0, 0.9), 0 0 16px rgba(255, 215, 0, 0.75)';

	const sortedWords = [...words].sort((a, b) => a.start - b.start);
	const activeChunkIndex = sortedWords.findIndex(
		(word) => highlightReferenceTime >= word.start && highlightReferenceTime <= word.end
	);
	const fallbackIndex = sortedWords.findIndex((word) => highlightReferenceTime < word.start);
	const resolvedChunkIndex =
		activeChunkIndex >= 0
			? activeChunkIndex
			: fallbackIndex >= 0
				? Math.max(0, fallbackIndex - 1)
				: Math.max(0, sortedWords.length - 1);
	const activeChunk = sortedWords[resolvedChunkIndex] ?? null;
	const rawTokens = (activeChunk?.text ?? '')
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);

	// Merge punctuation with preceding word to prevent line breaks
	const activeChunkTokens = rawTokens.reduce<string[]>((acc, token) => {
		const isPunctuation = /^[.!?,;:\-—–]+$/.test(token);
		if (isPunctuation && acc.length > 0) {
			// Attach punctuation to the previous word
			acc[acc.length - 1] += token;
		} else {
			acc.push(token);
		}
		return acc;
	}, []);

	const isSingleWordChunk = activeChunkTokens.length === 1;
	const effectiveSidePadding = isSingleWordChunk
		? Math.max(16, Math.min(42, Math.round(width * 0.035)))
		: sidePadding;
	const availableWidthPx = Math.max(140, width - effectiveSidePadding * 2);
	const singleWordLength = activeChunkTokens[0]?.length ?? 0;
	const singleWordHasExtremeLength = isSingleWordChunk && singleWordLength >= 18;
	const singleWordMaxPopScale = singleWordHasExtremeLength ? 1.06 : 1.2;
	const safetyScale = isSingleWordChunk ? singleWordMaxPopScale : 1.2;
	const perfectFontSize = calculatePerfectFontSize(
		activeChunkTokens,
		fontFamily,
		responsiveFontSize,
		availableWidthPx,
		maxCaptionLines,
		preset.tokenGapEm,
		safetyScale
	);
	const effectiveFontSize = Math.max(14, perfectFontSize);
	let highlightedTokenIndex = -1;
	let highlightedTokenStartTime = currentTime;

	if (activeChunk && activeChunk.words && activeChunk.words.length > 0) {
		const t = highlightReferenceTime;
		for (let i = 0; i < activeChunk.words.length; i++) {
			if (t >= activeChunk.words[i].start) {
				highlightedTokenIndex = i;
			}
		}
		if (highlightedTokenIndex >= 0) {
			highlightedTokenStartTime = activeChunk.words[highlightedTokenIndex].start;
		}
	} else {
		// Fallback to weight-based heuristic
		const activeChunkDuration = Math.max(
			0.001,
			(activeChunk?.end ?? currentTime) - (activeChunk?.start ?? currentTime)
		);
		const tokenWeights = activeChunkTokens.map((token) => {
			const normalized = token.replace(/[^\p{L}\p{N}]/gu, '');
			const lengthWeight = 1 + Math.min(10, normalized.length) * 0.08;
			const punctuationPauseBonus = /[.!?,:;]["')\]]*$/.test(token) ? 0.45 : 0;

			return lengthWeight + punctuationPauseBonus;
		});
		const totalWeight = tokenWeights.reduce((sum, weight) => sum + weight, 0) || 1;
		const elapsedInChunk = activeChunk
			? Math.max(0, Math.min(activeChunkDuration, highlightReferenceTime - activeChunk.start))
			: 0;
		const elapsedWeightTarget = (elapsedInChunk / activeChunkDuration) * totalWeight;

		let runningWeight = 0;
		let highlightedTokenStartWeight = 0;
		for (let i = 0; i < tokenWeights.length; i++) {
			const nextWeight = runningWeight + tokenWeights[i];
			if (elapsedWeightTarget <= nextWeight) {
				highlightedTokenIndex = i;
				highlightedTokenStartWeight = runningWeight;
				break;
			}
			runningWeight = nextWeight;
		}

		if (highlightedTokenIndex < 0 && tokenWeights.length > 0) {
			highlightedTokenIndex = tokenWeights.length - 1;
			highlightedTokenStartWeight = totalWeight - tokenWeights[tokenWeights.length - 1];
		}

		highlightedTokenStartTime =
			activeChunk && highlightedTokenIndex >= 0
				? activeChunk.start + (highlightedTokenStartWeight / totalWeight) * activeChunkDuration
				: currentTime;
	}
	const highlightedTokenStartFrame = Math.round(highlightedTokenStartTime * fps);
	const popSpring = spring({
		frame: Math.max(0, currentFrame - highlightedTokenStartFrame),
		fps,
		config: {
			damping: 12,
			stiffness: 220,
			mass: 0.8,
		},
	});
	const popScale = activeChunk
		? interpolate(popSpring, [0, 0.6, 1], [1, 1.2, 1], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
		  })
		: 1;
	const effectivePopScale =
		isSingleWordChunk && singleWordHasExtremeLength ? Math.min(1.06, popScale) : popScale;
	const stableMinHeightEm = Math.max(1.4, Math.min(2, 1.2 + chunkWindowSeconds * 0.1));

	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'flex-end',
				width: '100%',
				padding: `0 ${effectiveSidePadding}px`,
			}}
		>
			<div
				style={{
					display: 'block',
					width: '100%',
					minHeight: `${stableMinHeightEm}em`,
					maxHeight: `${captionLineHeight * maxCaptionLines}em`,
					maxWidth: isSingleWordChunk ? '100%' : preset.maxWidth,
					fontSize: `${effectiveFontSize}px`,
					fontFamily: `${fontFamily}, sans-serif`,
					fontWeight: 900,
					textTransform: 'uppercase',
					lineHeight: captionLineHeight,
					textAlign: 'center',
					overflow: 'visible',
					overflowWrap: 'normal',
					wordBreak: 'normal',
					hyphens: 'none',
					whiteSpace: 'normal',
					WebkitTextStroke: '2px black',
					textShadow: '0px 3px 6px rgba(0, 0, 0, 0.9)',
				}}
			>
				{activeChunkTokens.map((token, index) => {
					const isHighlighted = index === highlightedTokenIndex;
					const isAlreadySpoken = index < highlightedTokenIndex;

					return (
						<span
							key={`chunk-token-${resolvedChunkIndex}-${index}`}
							style={{
								display: 'inline-block',
								marginRight:
									index === activeChunkTokens.length - 1 ? '0' : `${preset.tokenGapEm}em`,
								color: isHighlighted ? accentColor : 'white',
								opacity: isHighlighted ? 1 : isAlreadySpoken ? 0.75 : 0.45,
								transform: isHighlighted ? `scale(${effectivePopScale})` : 'scale(1)',
								transformOrigin: 'center center',
								textShadow: isHighlighted
									? highlightGlow
									: '0px 3px 6px rgba(0, 0, 0, 0.9)',
							}}
						>
							{token}
						</span>
					);
				})}
			</div>
		</div>
	);
};
