import {useEffect, useMemo, useState} from 'react';
import {
	AbsoluteFill,
	Audio,
	interpolate,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {Captions, type CaptionChunk} from './Captions';
import {type CaptionStylePresetConfig} from './caption-style-presets';
import {FilmGrain} from './FilmGrain';
import {HookOverlay} from './HookOverlay';
import {ProgressBar} from './ProgressBar';
import {SlideVideoComponent} from './SlideVideo';
import {
	TIKTOK_SAFEZONE_BOTTOM_PX,
	TIKTOK_SAFEZONE_SIDE_PX,
	TIKTOK_SAFEZONE_TOP_PX,
} from './style-constants';
import {groupWhisperWordsToChunks, type WhisperWord} from './subtitle-utils';

export type MyCompositionProps = {
	audioID: string;
	speedMode?: 'aggressive' | 'balanced' | 'natural';
	gapThreshold?: number;
	chunkWindowSeconds?: number;
	captionStylePreset?: string;
	captionStylePresets?: Record<string, CaptionStylePresetConfig>;
	autoScaleExtremeWords?: boolean;
	debugCaptions?: boolean;
	imageFolder?: string;
	slideCount?: number;
	slideTypes?: ('image' | 'video')[];
};

type TranscriptWord = {
	text: string;
	start: number;
	end: number;
};

type TimeRange = {
	start: number;
	end: number;
};

const SENTENCE_BREAK_REGEX = /[.!?]["')\]]*$/;

const SPEED_PRESETS = {
	aggressive: 1.2,
	balanced: 2.0,
	natural: 2.8,
} as const;

const END_FADE_OUT_FRAMES = 15;

const mergeVoiceRanges = (words: TranscriptWord[], maxGapSeconds = 0.08): TimeRange[] => {
	if (words.length === 0) {
		return [];
	}

	const sortedWords = [...words].sort((a, b) => a.start - b.start);
	const merged: TimeRange[] = [];

	for (const word of sortedWords) {
		const lastRange = merged[merged.length - 1];

		if (!lastRange) {
			merged.push({start: word.start, end: word.end});
			continue;
		}

		if (word.start - lastRange.end <= maxGapSeconds) {
			lastRange.end = Math.max(lastRange.end, word.end);
			continue;
		}

		merged.push({start: word.start, end: word.end});
	}

	return merged;
};

const getFirstSentenceText = (words: TranscriptWord[]): string => {
	const sorted = [...words].sort((a, b) => a.start - b.start);
	const sentenceTokens: string[] = [];

	for (const word of sorted) {
		const token = (word.text ?? '').trim();

		if (!token) {
			continue;
		}

		sentenceTokens.push(token);

		if (/[.!?…]["')\]]*$/.test(token)) {
			break;
		}
	}

	return sentenceTokens
		.join(' ')
		.replace(/\s+([.,!?;:])/g, '$1')
		.trim();
};

const normalizeCaptionText = (text: string): string => {
	return text
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/\s+([.,!?;:])/g, '$1')
		.trim();
};

const getSlideTransitions = (
	transcription: TranscriptWord[],
	slidesCount: number,
	totalDurationSeconds: number,
	hookMinSeconds = 2
): number[] => {
	const maxTransitions = Math.max(0, slidesCount - 1);
	if (maxTransitions === 0 || totalDurationSeconds <= 0) {
		return [];
	}

	const punctuationBreakpoints = transcription
		.filter((word) => SENTENCE_BREAK_REGEX.test(word.text.trim()))
		.map((word) => word.end)
		.filter((time) => Number.isFinite(time) && time > 0 && time < totalDurationSeconds)
		.sort((a, b) => a - b)
		.reduce<number[]>((acc, value) => {
			if (acc.length === 0 || value > acc[acc.length - 1]) {
				acc.push(value);
			}

			return acc;
		}, []);

	const calculatedBreakpoints: number[] = [];

	for (const breakpoint of punctuationBreakpoints) {
		const guardedBreakpoint =
			calculatedBreakpoints.length === 0
				? Math.max(hookMinSeconds, breakpoint)
				: breakpoint;
		if (guardedBreakpoint >= totalDurationSeconds) {
			break;
		}

		if (
			calculatedBreakpoints.length === 0 ||
			guardedBreakpoint > calculatedBreakpoints[calculatedBreakpoints.length - 1]
		) {
			calculatedBreakpoints.push(guardedBreakpoint);
		}

		if (calculatedBreakpoints.length >= maxTransitions) {
			return calculatedBreakpoints;
		}
	}

	if (calculatedBreakpoints.length === 0) {
		calculatedBreakpoints.push(Math.min(hookMinSeconds, Math.max(0.01, totalDurationSeconds * 0.3)));
	}

	const remainingTransitions = maxTransitions - calculatedBreakpoints.length;
	if (remainingTransitions <= 0) {
		return calculatedBreakpoints.slice(0, maxTransitions);
	}

	const lastKnown = calculatedBreakpoints[calculatedBreakpoints.length - 1];
	const remainingRange = Math.max(0.01, totalDurationSeconds - lastKnown);
	const step = remainingRange / (remainingTransitions + 1);

	for (let i = 1; i <= remainingTransitions; i++) {
		const fallbackBreakpoint = Math.min(totalDurationSeconds - 0.01, lastKnown + step * i);
		if (fallbackBreakpoint > calculatedBreakpoints[calculatedBreakpoints.length - 1]) {
			calculatedBreakpoints.push(fallbackBreakpoint);
		}
	}

	return calculatedBreakpoints.slice(0, maxTransitions);
};

export const MyComposition: React.FC<MyCompositionProps> = ({
	audioID,
	speedMode,
	gapThreshold = 0.1,
	chunkWindowSeconds = 2,
	captionStylePreset = 'tiktok',
	captionStylePresets,
	autoScaleExtremeWords = true,
	debugCaptions = false,
	imageFolder,
	slideCount = 5,
	slideTypes,
}) => {
	const resolvedChunkWindowSeconds =
		speedMode && speedMode in SPEED_PRESETS
			? SPEED_PRESETS[speedMode]
			: chunkWindowSeconds;

	if (debugCaptions) {
		console.log('Rendering Reel with ID:', audioID);
	}

	const [captionWords, setCaptionWords] = useState<CaptionChunk[]>([]);
	const [transcriptionWords, setTranscriptionWords] = useState<TranscriptWord[]>([]);
	const [voiceRanges, setVoiceRanges] = useState<TimeRange[]>([]);
	const [hookText, setHookText] = useState('');
	const {fps, durationInFrames, width, height} = useVideoConfig();
	const currentFrame = useCurrentFrame();
	const currentTime = currentFrame / fps;
	const voiceoverSrc = staticFile(`${audioID}.mp3`);
	const slideSources = useMemo(() => {
		// Fallback-Logik: Prüfe imageFolder, sonst default
		const folder = imageFolder || 'slides/default';
		return Array.from({length: slideCount}, (_, index) => {
			const slideType = slideTypes && slideTypes[index] ? slideTypes[index] : 'image';
			const ext = slideType === 'video' ? 'mp4' : 'png';
			return {
				src: staticFile(`${folder}/slide${index}.${ext}`),
				type: slideType,
			};
		});
	}, [imageFolder, slideCount, slideTypes]);

	const getMusicVolume = (frame: number): number => {
		const currentTime = frame / fps;
		const fadeDurationSeconds = 10 / fps;
		let baseVolume = 0.3;

		for (const range of voiceRanges) {
			if (currentTime >= range.start && currentTime <= range.end) {
				baseVolume = Math.min(baseVolume, 0.1);
				continue;
			}

			if (currentTime >= range.start - fadeDurationSeconds && currentTime < range.start) {
				const fadedInDuck = interpolate(
					currentTime,
					[range.start - fadeDurationSeconds, range.start],
					[0.3, 0.1],
					{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
				);
				baseVolume = Math.min(baseVolume, fadedInDuck);
				continue;
			}

			if (currentTime > range.end && currentTime <= range.end + fadeDurationSeconds) {
				const fadedOutDuck = interpolate(
					currentTime,
					[range.end, range.end + fadeDurationSeconds],
					[0.1, 0.3],
					{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
				);
				baseVolume = Math.min(baseVolume, fadedOutDuck);
			}
		}

		let volume = baseVolume;

		for (const block of captionWords) {
			if (!block.isPowerWord) {
				continue;
			}

			const powerStartFrame = Math.max(0, Math.round(block.start * fps));
			const dipEndFrame = powerStartFrame + 5;
			const recoveryEndFrame = dipEndFrame + 10;

			if (frame >= powerStartFrame && frame < dipEndFrame) {
				volume = Math.min(volume, 0.02);
				continue;
			}

			if (frame >= dipEndFrame && frame <= recoveryEndFrame) {
				const recoveringVolume = interpolate(
					frame,
					[dipEndFrame, recoveryEndFrame],
					[0.02, baseVolume],
					{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
				);
				volume = Math.min(volume, recoveringVolume);
			}
		}

		return volume;
	};

	useEffect(() => {
		let isMounted = true;

		const loadVoiceover = async () => {
			const response = await fetch(`${staticFile(`${audioID}.json`)}?v=${Date.now()}`);
			const data = (await response.json()) as TranscriptWord[];

			const parsedWords: TranscriptWord[] = Array.isArray(data)
				? data
						.filter((word) =>
							typeof word?.text === 'string' &&
							typeof word?.start === 'number' &&
							typeof word?.end === 'number'
						)
						.map((word) => ({
							text: word.text,
							start: word.start,
							end: word.end,
						}))
				: [];

			if (debugCaptions) {
				console.log('Geladene Wörter:', parsedWords.length);
			}

			const whisperWords: WhisperWord[] = parsedWords.map((word) => ({
				word: word.text,
				start: word.start,
				end: word.end,
			}));
			const groupedWords = groupWhisperWordsToChunks(
				whisperWords,
				gapThreshold,
				resolvedChunkWindowSeconds
			);

			const mergedVoiceRanges = mergeVoiceRanges(parsedWords);
			const firstSentenceText = getFirstSentenceText(parsedWords);
			const normalizedHookText = normalizeCaptionText(firstSentenceText);
			const dedupedGroupedWords = groupedWords.filter((chunk, index) => {
				if (index !== 0 || normalizedHookText.length === 0) {
					return true;
				}

				const normalizedChunkText = normalizeCaptionText(chunk.text ?? '');
				const chunkStartsInHookWindow = chunk.start <= 2.2;
				const isDuplicateHookChunk =
					normalizedChunkText.length > 0 &&
					normalizedChunkText === normalizedHookText &&
					chunkStartsInHookWindow;

				if (isDuplicateHookChunk && debugCaptions) {
					console.log('Dedup: Entferne ersten Caption-Chunk (identisch mit Hook):', chunk.text);
				}

				return !isDuplicateHookChunk;
			});

			if (isMounted) {
				setCaptionWords(dedupedGroupedWords);
				setTranscriptionWords(parsedWords);
				setVoiceRanges(mergedVoiceRanges);
				setHookText(firstSentenceText);
			}
		};

		loadVoiceover().catch((error) => {
			console.error(`Failed to load ${audioID}.json`, error);
		});

		return () => {
			isMounted = false;
		};
	}, [audioID, gapThreshold, resolvedChunkWindowSeconds]);

	const topSafeInset = Math.max(TIKTOK_SAFEZONE_TOP_PX, Math.round(height * 0.11));
	const sideSafeInset = Math.max(TIKTOK_SAFEZONE_SIDE_PX, Math.round(width * 0.06));
	const bottomSafeInset = Math.max(TIKTOK_SAFEZONE_BOTTOM_PX, Math.round(height * 0.17));
	const progressBarBottom = bottomSafeInset;
	const progressBarHeight = 6;
	const captionToProgressGap = 20;
	const captionBottomSafeArea = progressBarBottom + progressBarHeight + captionToProgressGap;
	const sfxDurationFrames = Math.max(4, Math.round(fps * 0.22));
	const hookMinSlideSeconds = 2;
	const images = slideSources;
	const totalDurationSeconds = durationInFrames / fps;
	const calculatedBreakpoints = useMemo(
		() =>
			getSlideTransitions(
				transcriptionWords,
				images.length,
				totalDurationSeconds,
				hookMinSlideSeconds
			),
		[images.length, totalDurationSeconds, transcriptionWords]
	);
	const currentSlideIndex = Math.min(
		images.length - 1,
		calculatedBreakpoints.filter((breakpoint) => currentTime >= breakpoint).length
	);
	const currentSlideStartSec = currentSlideIndex === 0 ? 0 : calculatedBreakpoints[currentSlideIndex - 1];
	const currentSlideEndSec =
		currentSlideIndex < calculatedBreakpoints.length
			? calculatedBreakpoints[currentSlideIndex]
			: totalDurationSeconds;
	const currentSlideStartFrame = Math.max(0, Math.round(currentSlideStartSec * fps));
	const currentSlideEndFrame = Math.max(currentSlideStartFrame + 1, Math.round(currentSlideEndSec * fps));
	const hookDurationFrames = Math.max(
		1,
		Math.round((calculatedBreakpoints[0] ?? hookMinSlideSeconds) * fps)
	);
	const hookBackgroundBrightness = interpolate(
		currentFrame,
		[0, Math.min(50, hookDurationFrames), hookDurationFrames],
		[0.4, 0.4, 1],
		{
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		}
	);
	const currentSlideCaptionWords = useMemo(() => {
		const startSec = currentSlideStartSec;
		const endSecExclusive = Math.max(startSec, currentSlideEndSec - 0.001);

		return captionWords
			.filter((word) => word.start < endSecExclusive && word.end > startSec)
			.map((word) => ({
				...word,
				start: Math.max(word.start, startSec),
				end: Math.min(word.end, endSecExclusive),
			}))
			.filter((word) => word.end > word.start);
	}, [captionWords, currentSlideEndSec, currentSlideStartSec]);
	
	const audioEndFrame = Math.max(0, durationInFrames - END_FADE_OUT_FRAMES);
	const fadeOutStartFrame = Math.min(audioEndFrame, Math.max(0, durationInFrames - 1));
	
	const isHookWindowActive = currentFrame < hookDurationFrames;

	const getSfxTargetVolume = (isPowerWord: boolean): number => {
		return isPowerWord ? 0.8 : 0.55;
	};

	const isSfxActiveAtFrame = (startFrame: number, frame: number): boolean => {
		return frame >= startFrame && frame < startFrame + sfxDurationFrames;
	};

	const voiceoverVolume = 0.9;
	const desiredMusicVolume = getMusicVolume(currentFrame);
	const cappedMusicVolume = Math.min(
		desiredMusicVolume,
		Math.max(0, 1 - voiceoverVolume)
	);
	const activeCaptionWord = debugCaptions
		? currentSlideCaptionWords.find((word) => currentTime >= word.start && currentTime <= word.end) ?? null
		: null;

	const activeSfxTargetSum = captionWords.reduce((sum, block) => {
		const blockStartFrame = Math.max(0, Math.round(block.start * fps));
		if (!isSfxActiveAtFrame(blockStartFrame, currentFrame)) {
			return sum;
		}

		return sum + getSfxTargetVolume(Boolean(block.isPowerWord));
	}, 0);

	const sfxHeadroom = Math.max(0, 1 - voiceoverVolume - cappedMusicVolume);
	const sfxScale =
		activeSfxTargetSum > 0 ? Math.min(1, sfxHeadroom / activeSfxTargetSum) : 1;

	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			<Audio src={voiceoverSrc} volume={voiceoverVolume} />
			<Audio src={staticFile('assets/music.mp3')} loop volume={cappedMusicVolume} />

			{captionWords.map((block, index) => {
				const startFrame = Math.max(0, Math.round(block.start * fps));
				const isPowerWord = Boolean(block.isPowerWord);
				const sfxSrc = isPowerWord
					? staticFile('assets/impact.mp3')
					: staticFile('assets/pop.mp3');
				const isActiveNow = isSfxActiveAtFrame(startFrame, currentFrame);
				const sfxTarget = getSfxTargetVolume(isPowerWord);
				const sfxVolume = isActiveNow ? sfxTarget * sfxScale : 0;

				return (
					<Sequence
						key={`sfx-${index}-${startFrame}`}
						from={startFrame}
						durationInFrames={sfxDurationFrames}
					>
						<Audio
							src={sfxSrc}
							startFrom={0}
							endAt={sfxDurationFrames}
							volume={sfxVolume}
						/>
					</Sequence>
				);
			})}

			{/* 1. Dynamischer Slide-Hintergrund: Wechsel über Satzenden/Pausen */}
			{images.length > 0 ? (() => {
				// Während Hook: slide0, ansonsten: aktuelle Slide
				const displayedSlideIndex = isHookWindowActive ? 0 : currentSlideIndex;
				const safeSlideIndex = Math.min(displayedSlideIndex, images.length - 1);
				const currentSlide = images[safeSlideIndex];
				const isVideo = currentSlide.type === 'video';
				const slideDurationFrames = currentSlideEndFrame - currentSlideStartFrame;

				return (
					<Sequence
						key={`slide-sequence-${safeSlideIndex}-${currentSlideStartFrame}`}
						from={currentSlideStartFrame}
						durationInFrames={slideDurationFrames}
					>
						<SlideVideoComponent
							src={currentSlide.src}
							isVideo={isVideo}
							slideDuration={slideDurationFrames}
							brightness={hookBackgroundBrightness}
							onError={() => {
								console.warn(`⚠️ Slide ${safeSlideIndex} (${isVideo ? 'video' : 'image'}) not found for folder "${imageFolder}"`);
							}}
						/>
					</Sequence>
				);
			})() : null}

			<Sequence from={0} durationInFrames={hookDurationFrames}>
				<HookOverlay text={hookText} captionStylePreset={captionStylePreset} />
			</Sequence>

			{/* 2. Die Untertitel + Progress Bar Container */}
			<AbsoluteFill
				style={{
					zIndex: 100,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'flex-end',
					padding: `0 ${sideSafeInset}px`,
				}}
			>
				{debugCaptions ? (
					<>
						<div
							style={{
								position: 'absolute',
								top: topSafeInset,
								left: '50%',
								transform: 'translateX(-50%)',
								color: 'yellow',
								fontSize: 120,
								fontWeight: 'bold',
								textAlign: 'center',
								textShadow: '0 0 10px rgba(0,0,0,0.9)',
								pointerEvents: 'none',
							}}
						>
							{activeCaptionWord?.text ?? ''}
						</div>

						<p
							style={{
								position: 'absolute',
								top: Math.max(16, topSafeInset - 56),
								left: sideSafeInset,
								margin: 0,
								color: 'yellow',
								fontSize: 48,
								fontWeight: 'bold',
								textShadow: '0 0 8px rgba(0,0,0,0.95)',
								pointerEvents: 'none',
							}}
						>
							Test-Sichtbarkeit
						</p>
					</>
				) : null}

				{/* Captions */}
				<div
					style={{
						width: '100%',
						textAlign: 'center',
						marginBottom: `${captionBottomSafeArea}px`,
					}}
				>
					<Captions
						words={isHookWindowActive ? [] : currentSlideCaptionWords}
						chunkWindowSeconds={resolvedChunkWindowSeconds}
						captionStylePreset={captionStylePreset}
						captionStylePresets={captionStylePresets}
						autoScaleExtremeWords={autoScaleExtremeWords}
					/>
				</div>

				{/* Progress Bar */}
				<div
					style={{
						position: 'absolute',
						left: sideSafeInset,
						right: sideSafeInset,
						bottom: progressBarBottom,
					}}
				>
					<ProgressBar captionStylePreset={captionStylePreset} />
				</div>
			</AbsoluteFill>

			<FilmGrain />

			{/* 3. Schwarzblende erst NACH Audio-Ende über den Nachlauf */}
			<AbsoluteFill
				style={{
					backgroundColor: '#000',
					opacity: interpolate(
						currentFrame,
						[fadeOutStartFrame, durationInFrames],
						[0, 1],
						{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
					),
					zIndex: 999,
				}}
			/>
		</AbsoluteFill>
	);
};