import {useEffect, useState} from 'react';
import {Video, OffthreadVideo, Img, interpolate, spring, useRemotionEnvironment, useCurrentFrame, useVideoConfig} from 'remotion';

type SlideVideoProps = {
	src: string;
	isVideo: boolean;
	slideDuration: number;
	brightness: number;
	layerOpacity?: number;
	style?: React.CSSProperties;
	onError?: () => void;
};

export const SlideVideoComponent: React.FC<SlideVideoProps> = ({
	src,
	isVideo,
	slideDuration,
	brightness,
	layerOpacity = 0.6,
	style,
	onError,
}) => {
	const [videoDurationInFrames, setVideoDurationInFrames] = useState<number | null>(null);
	const env = useRemotionEnvironment();
	const currentFrame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const relativeFrame = currentFrame;

	useEffect(() => {
		if (!isVideo) {
			setVideoDurationInFrames(null);
			return;
		}

		let isActive = true;
		const probe = document.createElement('video');
		probe.preload = 'metadata';
		probe.src = src;

		const handleLoadedMetadata = () => {
			if (!isActive) {
				return;
			}

			const durationSeconds = probe.duration;
			if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
				setVideoDurationInFrames(slideDuration);
				return;
			}

			setVideoDurationInFrames(Math.ceil(durationSeconds * fps));
		};

		const handleMetadataError = () => {
			if (!isActive) {
				return;
			}

			setVideoDurationInFrames(slideDuration);
		};

		probe.addEventListener('loadedmetadata', handleLoadedMetadata);
		probe.addEventListener('error', handleMetadataError);
		probe.load();

		return () => {
			isActive = false;
			probe.removeEventListener('loadedmetadata', handleLoadedMetadata);
			probe.removeEventListener('error', handleMetadataError);
			probe.src = '';
		};
	}, [fps, isVideo, slideDuration, src]);

	// Hook-Zoom/Ken-Burns Steuerung pro Slide
	const getAnimations = () => {
		// Für Videos: Während der Wiedergabe KEIN Zoom/Ken-Burns.
		// Ken-Burns nur im Restfenster nach Video-Ende bis Slidewechsel.
		if (isVideo) {
			const videoEndFrame = videoDurationInFrames ?? slideDuration;

			if (relativeFrame < videoEndFrame) {
				return {scale: 1, rotation: 0, blur: 0, translateX: 0, translateY: 0};
			}

			const remainingFrames = Math.max(0, slideDuration - videoEndFrame);
			if (remainingFrames <= 1) {
				return {scale: 1, rotation: 0, blur: 0, translateX: 0, translateY: 0};
			}

			const intensityFactor = interpolate(remainingFrames, [2, 8, 20, 45], [0.2, 0.35, 0.75, 1], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			const isCinematicShortWindow = remainingFrames <= 12;
			const targetScale = isCinematicShortWindow
				? 1 + 0.06 * intensityFactor
				: 1 + 0.15 * intensityFactor;
			const targetTranslateX = isCinematicShortWindow ? 0 : -12 * intensityFactor;
			const targetTranslateY = isCinematicShortWindow
				? -4 * intensityFactor
				: -8 * intensityFactor;

			const kenBurnsStartFrame = videoEndFrame;
			const kenBurnsEndFrame = Math.max(kenBurnsStartFrame + 1, slideDuration);
			const kenBurnsScale = interpolate(
				relativeFrame,
				[kenBurnsStartFrame, kenBurnsEndFrame],
				[1.0, targetScale],
				{
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				}
			);

			const translateX = interpolate(
				relativeFrame,
				[kenBurnsStartFrame, kenBurnsEndFrame],
				[0, targetTranslateX],
				{
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				}
			);

			const translateY = interpolate(
				relativeFrame,
				[kenBurnsStartFrame, kenBurnsEndFrame],
				[0, targetTranslateY],
				{
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				}
			);

			return {scale: kenBurnsScale, rotation: 0, blur: 0, translateX, translateY};
		}

		// Phase 1: Hook-Zoom (erste 10 Frames)
		if (relativeFrame < 10) {
			const springVal = spring({
				fps,
				frame: relativeFrame,
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

		// Phase 3: Für Bilder - Ken Burns nach Frame 10
		const kenBurnsStartFrame = 10;
		const kenBurnsEndFrame = Math.max(kenBurnsStartFrame + 20, slideDuration);
		const kenBurnsScale = interpolate(relativeFrame, [kenBurnsStartFrame, kenBurnsEndFrame], [1.05, 1.15], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		const translateX = interpolate(relativeFrame, [kenBurnsStartFrame, kenBurnsEndFrame], [0, -12], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		const translateY = interpolate(relativeFrame, [kenBurnsStartFrame, kenBurnsEndFrame], [0, -8], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		return {scale: kenBurnsScale, rotation: 0, blur: 0, translateX, translateY};
	};

	const {scale, rotation, blur, translateX, translateY} = getAnimations();

	const commonStyles: React.CSSProperties = {
		position: 'absolute',
		inset: 0,
		width: '100%',
		height: '100%',
		objectFit: 'cover',
		opacity: layerOpacity,
		transform: `scale(${scale}) rotate(${rotation}deg) translate(${translateX}px, ${translateY}px)`,
		filter: `brightness(${brightness}) blur(${blur}px)`,
		...style,
	};

	if (isVideo) {
		if (env.isRendering) {
			return (
				<OffthreadVideo
					src={src}
					style={commonStyles}
					muted={true}
					playbackRate={1}
					loop={false}
					delayRenderTimeoutInMilliseconds={300000}
					delayRenderRetries={8}
					onError={() => {
						console.warn(`⚠️ Video slide not found: ${src}`);
						onError?.();
					}}
				/>
			);
		}

		return (
			<Video
				src={src}
				style={commonStyles}
				muted={true}
				playbackRate={1}
				loop={false}
				onError={() => {
					console.warn(`⚠️ Video slide not found: ${src}`);
					onError?.();
				}}
			/>
		);
	}

	return (
		<Img
			src={src}
			style={commonStyles}
			onError={() => {
				console.warn(`⚠️ Image slide not found: ${src}`);
				onError?.();
			}}
		/>
	);
};
