import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';
import {
	type CaptionStylePresetConfig,
	DEFAULT_CAPTION_STYLE_PRESETS,
} from './caption-style-presets';
import {getAccentColorByPreset} from './style-constants';

const {fontFamily} = loadFont('normal', {
	weights: ['900'],
});

export type CaptionWord = {
	text: string;
	start: number;
	end: number;
};

export type CaptionChunk = CaptionWord & {
	isPowerWord?: boolean;
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
		(word) => currentFrame >= word.start * fps && currentFrame <= word.end * fps
	);
	const fallbackIndex = sortedWords.findIndex((word) => currentTime < word.start);
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
	const singleWordVisualPaddingPx = 28;
	const singleWordMaxTextWidthPx = Math.max(80, availableWidthPx - singleWordVisualPaddingPx);
	const singleWordMaxPopScale = singleWordHasExtremeLength ? 1.06 : 1.2;
	const singleWordAutoFontSize = Math.max(
		42,
		Math.min(
			110,
			Math.round(
				(singleWordMaxTextWidthPx / (Math.max(1, singleWordLength) * 0.74)) /
					singleWordMaxPopScale
			)
		)
	);
	const estimatedCharWidthFactor = 0.62;
	const totalCharacters = activeChunkTokens.join(' ').length;
	const tokenGapEstimatePx =
		Math.max(0, activeChunkTokens.length - 1) * responsiveFontSize * preset.tokenGapEm;
	const estimatedSingleLineWidthPx =
		totalCharacters * responsiveFontSize * estimatedCharWidthFactor + tokenGapEstimatePx;
	const estimatedLinesAtResponsive = Math.max(1, estimatedSingleLineWidthPx / availableWidthPx);
	const lineFitFontSize =
		estimatedLinesAtResponsive > maxCaptionLines
			? Math.floor((responsiveFontSize * maxCaptionLines) / estimatedLinesAtResponsive)
			: responsiveFontSize;
	const singleWordWidthFitFontSize = Math.floor(
		(singleWordMaxTextWidthPx / (Math.max(1, singleWordLength) * 0.74)) /
			singleWordMaxPopScale
	);
	const preferredFontSize =
		autoScaleExtremeWords && isSingleWordChunk
			? Math.min(
					Math.max(36, responsiveFontSize),
					singleWordAutoFontSize,
					singleWordWidthFitFontSize
			  )
			: Math.min(responsiveFontSize, lineFitFontSize);
	const effectiveFontSize = Math.max(
		14,
		Math.min(
			preferredFontSize,
			lineFitFontSize,
			isSingleWordChunk ? singleWordWidthFitFontSize : Number.POSITIVE_INFINITY
		)
	);
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
		? Math.max(0, Math.min(activeChunkDuration, currentTime - activeChunk.start))
		: 0;
	const elapsedWeightTarget = (elapsedInChunk / activeChunkDuration) * totalWeight;

	let runningWeight = 0;
	let highlightedTokenIndex = -1;
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

	const highlightedTokenStartTime =
		activeChunk && highlightedTokenIndex >= 0
			? activeChunk.start + (highlightedTokenStartWeight / totalWeight) * activeChunkDuration
			: currentTime;
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
					overflow: 'hidden',
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
