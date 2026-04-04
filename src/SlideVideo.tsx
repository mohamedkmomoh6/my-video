import {useState} from 'react';
import {Video, OffthreadVideo, Img, interpolate, spring, useRemotionEnvironment} from 'remotion';

type SlideVideoProps = {
	src: string;
	isVideo: boolean;
	relativeFrame: number;
	slideDuration: number;
	fps: number;
	brightness: number;
	style?: React.CSSProperties;
	onError?: () => void;
};

export const SlideVideoComponent: React.FC<SlideVideoProps> = ({
	src,
	isVideo,
	relativeFrame,
	slideDuration,
	fps,
	brightness,
	style,
	onError,
}) => {
	const [videoDurationInFrames, setVideoDurationInFrames] = useState<number | null>(null);
	const env = useRemotionEnvironment();

	// Hook-Zoom: Aggressives Reinziehen mit Spring, Rotation und Blur über 10 Frames
	const getAnimations = () => {
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

		// Phase 2: Ken-Burns-Effekt (Frames 10+)
		// Für Videos: erst Video abspielen, dann Ken Burns auf End-Frame
		const videoEndFrame = videoDurationInFrames ?? slideDuration;
		const holdStartFrame = Math.min(videoEndFrame, slideDuration);

		let kenBurnsFrame = relativeFrame;
		if (isVideo && relativeFrame < holdStartFrame) {
			// Video läuft noch, keine Ken Burns
			return {scale: 1, rotation: 0, blur: 0, translateX: 0, translateY: 0};
		}

		// Ab hier: Ken Burns Effect (nach Video-Ende oder für Images)
		const kenBurnsEndFrame = Math.max(holdStartFrame + 10, slideDuration);
		const kenBurnsScale = interpolate(kenBurnsFrame, [holdStartFrame, kenBurnsEndFrame], [1.05, 1.15], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		const translateX = interpolate(kenBurnsFrame, [holdStartFrame, kenBurnsEndFrame], [0, -12], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

		const translateY = interpolate(kenBurnsFrame, [holdStartFrame, kenBurnsEndFrame], [0, -8], {
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
		opacity: 0.6,
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
					delayRenderTimeoutInMilliseconds={240000}
					delayRenderRetries={4}
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
				onLoadedMetadata={(e) => {
					const videoElement = e.target as HTMLVideoElement;
					const durationSeconds = videoElement.duration;
					const durationFrames = Math.ceil(durationSeconds * fps);
					setVideoDurationInFrames(durationFrames);
				}}
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
