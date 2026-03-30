import {useEffect, useMemo, useState} from 'react';
import {
	AbsoluteFill,
	Audio,
	Img,
	interpolate,
	Sequence,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {Captions, type CaptionChunk} from './Captions';
import {type CaptionStylePresetConfig} from './caption-style-presets';
import {FilmGrain} from './FilmGrain';
import {HookOverlay} from './HookOverlay';
import {ProgressBar} from './ProgressBar';
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
	const [hookStartFrame, setHookStartFrame] = useState(0);
	const {fps, durationInFrames} = useVideoConfig();
	const currentFrame = useCurrentFrame();
	const currentTime = currentFrame / fps;
	const voiceoverSrc = staticFile(`${audioID}.mp3`);
	const slideSources = useMemo(() => {
		// Fallback-Logik: Prüfe imageFolder, sonst default
		const folder = imageFolder || 'slides/default';
		return Array.from({length: 5}, (_, index) => staticFile(`${folder}/slide${index}.png`));
	}, [imageFolder]);

	// Hook-Zoom: Aggressives Reinziehen mit Spring, Rotation und Blur über 10 Frames
	// Danach: Ken-Burns-Effekt mit langsamem Zoom und subtiler Kamerafahrt
	const getImageAnimations = (frame: number, slideDurationInFrames: number) => {
		if (frame < 10) {
			const springVal = spring({
				fps,
				frame,
				config: {damping: 8, stiffness: 280},
			});

			const scale = interpolate(springVal, [0, 1], [1.5, 1.05], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});

			const rotation = interpolate(springVal, [0, 1], [-3, 0], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});

			const blur = interpolate(springVal, [0, 1], [15, 0], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});

			return {scale, rotation, blur, translateX: 0, translateY: 0};
		}

		// Phase 2: Ken-Burns-Effekt (Frames 10+)
		const kenBurnsEndFrame = Math.max(11, slideDurationInFrames);
		const kenBurnsScale = interpolate(frame, [10, kenBurnsEndFrame], [1.05, 1.15], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		// Subtile Kamerafahrt: Langsam nach oben-links driften
		const translateX = interpolate(frame, [10, kenBurnsEndFrame], [0, -12], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		const translateY = interpolate(frame, [10, kenBurnsEndFrame], [0, -8], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		return {scale: kenBurnsScale, rotation: 0, blur: 0, translateX, translateY};
	};

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
			const firstSpokenWord = parsedWords.find((word) => word.text.trim().length > 0);
			const firstSpokenStartFrame = Math.max(
				0,
				Math.round((firstSpokenWord?.start ?? 0) * fps)
			);
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
				setHookStartFrame(firstSpokenStartFrame);
			}
		};

		loadVoiceover().catch((error) => {
			console.error(`Failed to load ${audioID}.json`, error);
		});

		return () => {
			isMounted = false;
		};
	}, [audioID, gapThreshold, resolvedChunkWindowSeconds]);

	const progressBarBottom = 28;
	const progressBarHeight = 6;
	const captionToProgressGap = 20;
	const captionBottomSafeArea = progressBarBottom + progressBarHeight + captionToProgressGap;
	const sfxDurationFrames = Math.max(4, Math.round(fps * 0.22));
	const hookDurationFrames = Math.max(1, Math.round(fps * 2));
	const hookMinSlideSeconds = 2;
	const hookBackgroundBrightness = interpolate(
		currentFrame,
		[hookStartFrame, hookStartFrame + 50, hookStartFrame + hookDurationFrames],
		[0.4, 0.4, 1],
		{
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		}
	);
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
	
	// Voiceover-Dauer berechnen: Letztes Wort Ende
	const voiceoverEndSeconds = transcriptionWords.length > 0 
		? Math.max(...transcriptionWords.map((w) => w.end))
		: totalDurationSeconds;
	const voiceoverEndFrame = Math.round(voiceoverEndSeconds * fps);
	
	// Audio-Fade-out über die letzten 15 Frames nach Voiceover-Ende (synchron zur Schwarzblende)
	const getAudioFadeOut = (frame: number): number => {
		return interpolate(
			frame,
			[voiceoverEndFrame - 15, durationInFrames],
			[1, 0],
			{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
		);
	};
	
	const isHookWindowActive =
		currentFrame >= hookStartFrame && currentFrame < hookStartFrame + hookDurationFrames;

	const getSfxTargetVolume = (isPowerWord: boolean): number => {
		return isPowerWord ? 0.8 : 0.55;
	};

	const isSfxActiveAtFrame = (startFrame: number, frame: number): boolean => {
		return frame >= startFrame && frame < startFrame + sfxDurationFrames;
	};

	const voiceoverVolume = 0.9 * getAudioFadeOut(currentFrame);
	const desiredMusicVolume = getMusicVolume(currentFrame) * getAudioFadeOut(currentFrame);
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
				const relativeFrame = Math.max(0, currentFrame - currentSlideStartFrame);
				const slideDuration = Math.max(
					1,
					currentSlideEndFrame - currentSlideStartFrame
				);
				const {scale, rotation, blur, translateX, translateY} = getImageAnimations(
					relativeFrame,
					slideDuration
				);

				return (
					<Img
						key={`slide-${safeSlideIndex}-${currentSlideStartFrame}`}
						src={images[safeSlideIndex]}
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							opacity: 0.6,
							transform: `scale(${scale}) rotate(${rotation}deg) translate(${translateX}px, ${translateY}px)`,
							filter: `brightness(${hookBackgroundBrightness}) blur(${blur}px)`,
						}}
						onError={() => {
							console.warn(`⚠️ Slide ${safeSlideIndex} not found for folder "${imageFolder}"`);
						}}
					/>
				);
			})() : null}

			<Sequence from={hookStartFrame} durationInFrames={hookDurationFrames}>
				<HookOverlay text={hookText} />
			</Sequence>

			{/* 2. Die Untertitel + Progress Bar Container */}
			<AbsoluteFill
				style={{
					zIndex: 100,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'flex-end',
					padding: '0 80px',
				}}
			>
				{debugCaptions ? (
					<>
						<div
							style={{
								position: 'absolute',
								top: 80,
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
								top: 24,
								left: 24,
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
						left: 80,
						right: 80,
						bottom: progressBarBottom,
					}}
				>
					<ProgressBar />
				</div>
			</AbsoluteFill>

			<FilmGrain />

			{/* 3. Schwarzblende am Videoende über die letzten 15 Frames */}
			<AbsoluteFill
				style={{
					backgroundColor: '#000',
					opacity: interpolate(
						currentFrame,
						[voiceoverEndFrame - 15, durationInFrames],
						[0, 1],
						{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
					),
					zIndex: 999,
				}}
			/>
		</AbsoluteFill>
	);
};