import { useEffect, useId, useState } from 'react';
import {
	AbsoluteFill,
	Video,
	OffthreadVideo,
	Img,
	Freeze,
	Easing,
	delayRender,
	continueRender,
	interpolate,
	spring,
	useRemotionEnvironment,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type SlideVideoProps = {
	src: string;
	isVideo: boolean;
	slideDuration: number;
	brightness: number;
	/** Szenen-Index (0-basiert). Steuert die Drift-Richtung: gerade = links, ungerade = rechts. */
	slideIndex: number;
	/** Whip-Pan-In am Szenenanfang (von rechts herein). Aus für die allererste Szene. */
	enableWhipIn?: boolean;
	/** Whip-Pan-Out am Szenenende (nach links hinaus). Aus für die letzte Szene. */
	enableWhipOut?: boolean;
	layerOpacity?: number;
	style?: React.CSSProperties;
	onError?: () => void;
};

// Whip-Pan (Reißschwenk) Parameter
const WHIP_FRAMES = 7;
const WHIP_BLUR_MAX = 24;

export const SlideVideoComponent: React.FC<SlideVideoProps> = ({
	src,
	isVideo,
	slideDuration,
	brightness,
	slideIndex,
	enableWhipIn = false,
	enableWhipOut = false,
	layerOpacity = 0.6,
	style,
	onError,
}) => {
	const [videoDurationInFrames, setVideoDurationInFrames] = useState<number | null>(null);
	const env = useRemotionEnvironment();
	const relativeFrame = useCurrentFrame();
	const { fps, width } = useVideoConfig();
	// Eindeutige, url()-taugliche Filter-ID (useId liefert ":r0:" -> Doppelpunkte raus).
	const whipFilterId = `whip-blur-${useId().replace(/:/g, '')}`;

	// ----------------------------------------------------------------------------
	// WHIP-PAN (Reißschwenk): Single-Layer-Übergang zwischen Szenen.
	// Out = letzte 7 Frames der Szene (nach links raus), In = erste 7 Frames der
	// nächsten Szene (von rechts rein). Liegt auf demselben äußeren Wrapper wie
	// Zoom/Drift, also AUSSERHALB von <Freeze> -> ein eingefrorener Frame whippt
	// sauber mit, ohne die Freeze-Logik zu zerstören.
	// ----------------------------------------------------------------------------
	const canWhip = slideDuration > WHIP_FRAMES * 2 + 2;
	let whipTranslateX = 0;
	let whipBlur = 0;

	if (canWhip && enableWhipIn && relativeFrame < WHIP_FRAMES) {
		const t = relativeFrame / WHIP_FRAMES;
		const eased = Easing.out(Easing.cubic)(t);
		whipTranslateX = interpolate(eased, [0, 1], [width, 0]);
		whipBlur = interpolate(t, [0, 0.5, 1], [WHIP_BLUR_MAX, WHIP_BLUR_MAX * 0.6, 0], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	} else if (canWhip && enableWhipOut && relativeFrame > slideDuration - WHIP_FRAMES) {
		const t = (relativeFrame - (slideDuration - WHIP_FRAMES)) / WHIP_FRAMES;
		const eased = Easing.in(Easing.cubic)(t);
		whipTranslateX = interpolate(eased, [0, 1], [0, -width]);
		whipBlur = interpolate(t, [0, 0.5, 1], [0, WHIP_BLUR_MAX * 0.6, WHIP_BLUR_MAX], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	}

	// Echter HORIZONTALER Motion-Blur via SVG (stdDeviation "X 0" -> nur X-Achse).
	// Reads filmischer als isotropes CSS-blur(). Filter-Region weit aufgezogen,
	// damit der Smear nicht clippt; sRGB-Interpolation gegen dunkle Kanten.
	const isWhipping = whipBlur > 0;
	const whipFilterCss = isWhipping ? `url(#${whipFilterId})` : '';
	const whipFilterSvg = isWhipping ? (
		<svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
			<defs>
				<filter
					id={whipFilterId}
					x="-50%"
					y="-10%"
					width="200%"
					height="120%"
					colorInterpolationFilters="sRGB"
				>
					<feGaussianBlur in="SourceGraphic" stdDeviation={`${whipBlur} 0`} />
				</filter>
			</defs>
		</svg>
	) : null;

	// Clip-Länge ermitteln. delayRender hält das Rendering an, bis die echte
	// Video-Dauer bekannt ist – sonst kann der Freeze-Zeitpunkt beim Render danebenliegen.
	useEffect(() => {
		if (!isVideo) {
			setVideoDurationInFrames(null);
			return;
		}

		let isActive = true;
		const handle = delayRender(`Probing duration: ${src}`);
		const probe = document.createElement('video');
		probe.preload = 'metadata';
		probe.src = src;

		const finish = (frames: number) => {
			if (!isActive) {
				return;
			}
			setVideoDurationInFrames(frames);
			continueRender(handle);
		};

		const handleLoadedMetadata = () => {
			const durationSeconds = probe.duration;
			if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
				finish(slideDuration);
				return;
			}
			finish(Math.ceil(durationSeconds * fps));
		};

		const handleMetadataError = () => {
			finish(slideDuration);
		};

		probe.addEventListener('loadedmetadata', handleLoadedMetadata);
		probe.addEventListener('error', handleMetadataError);
		probe.load();

		return () => {
			isActive = false;
			probe.removeEventListener('loadedmetadata', handleLoadedMetadata);
			probe.removeEventListener('error', handleMetadataError);
			probe.src = '';
			continueRender(handle);
		};
	}, [fps, isVideo, slideDuration, src]);

	// ----------------------------------------------------------------------------
	// VIDEO-PFAD: durchgehender Retention-Zoom + Directional Drift über die ganze
	// Szene (Video + Freeze). Der Transform liegt bewusst AUSSERHALB von <Freeze>,
	// damit die Bewegung weiterläuft, während die Video-Pixel eingefroren sind.
	// ----------------------------------------------------------------------------
	if (isVideo) {
		const sceneEndFrame = Math.max(1, slideDuration);
		const linearProgress = interpolate(relativeFrame, [0, sceneEndFrame], [0, 1], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		// Ease-in-out statt linear: startet "barely noticeable", läuft am Szenenende
		// sanft aus (statt mechanischem Konstant-Drift). Lässt zudem dem Whip-Out
		// die Bühne, da die Drift-Bewegung am Ende fast steht.
		const progress = Easing.inOut(Easing.quad)(linearProgress);

		// Dezenter 3%-Zoom (Sweet-Spot 1.5-4%). Start bei 1.05 (nicht 1.0!) =>
		// Overscan-Headroom, damit der Drift keine schwarze Kante hereinschiebt
		// (objectFit: cover füllt bei 1.0 exakt).
		const scale = interpolate(progress, [0, 1], [1.05, 1.08]);

		// Gerade Szenen driften nach links, ungerade nach rechts.
		const driftDirection = slideIndex % 2 === 0 ? -1 : 1;
		const translateX = interpolate(progress, [0, 1], [0, driftDirection * 18]);
		const translateY = interpolate(progress, [0, 1], [0, -10]);

		// Freeze, sobald das Material zu Ende ist – auf dem letzten echten Frame.
		const videoEndFrame = videoDurationInFrames ?? slideDuration;
		const isFrozen = relativeFrame >= videoEndFrame;
		const freezeFrame = Math.max(0, videoEndFrame - 1);

		const wrapperStyle: React.CSSProperties = {
			position: 'absolute',
			inset: 0,
			transform: `translateX(${whipTranslateX}px) scale(${scale}) translate(${translateX}px, ${translateY}px)`,
			filter: isWhipping ? whipFilterCss : undefined,
			...style,
		};

		const mediaStyle: React.CSSProperties = {
			position: 'absolute',
			inset: 0,
			width: '100%',
			height: '100%',
			objectFit: 'cover',
			opacity: layerOpacity,
			filter: `brightness(${brightness})`,
		};

		const media = env.isRendering ? (
			<OffthreadVideo
				src={src}
				style={mediaStyle}
				muted
				playbackRate={1}
				delayRenderTimeoutInMilliseconds={300000}
				delayRenderRetries={8}
				onError={() => {
					console.warn(`⚠️ Video slide not found: ${src}`);
					onError?.();
				}}
			/>
		) : (
			<Video
				src={src}
				style={mediaStyle}
				muted
				playbackRate={1}
				loop={false}
				onError={() => {
					console.warn(`⚠️ Video slide not found: ${src}`);
					onError?.();
				}}
			/>
		);

		return (
			<>
				{whipFilterSvg}
				<AbsoluteFill style={wrapperStyle}>
					<Freeze frame={freezeFrame} active={isFrozen}>
						{media}
					</Freeze>
				</AbsoluteFill>
			</>
		);
	}

	// ----------------------------------------------------------------------------
	// BILD-PFAD: Hook-Zoom (erste 10 Frames) + Ken Burns. Unverändertes Verhalten.
	// ----------------------------------------------------------------------------
	const getImageAnimations = () => {
		// Phase 1: Hook-Zoom (erste 10 Frames)
		if (relativeFrame < 10) {
			const springVal = spring({
				fps,
				frame: relativeFrame,
				config: { damping: 8, stiffness: 280 },
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

			return { scale, rotation, blur, translateX: 0, translateY: 0 };
		}

		// Phase 2: Ken Burns nach Frame 10
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

		return { scale: kenBurnsScale, rotation: 0, blur: 0, translateX, translateY };
	};

	const { scale, rotation, blur, translateX, translateY } = getImageAnimations();

	const imgStyle: React.CSSProperties = {
		position: 'absolute',
		inset: 0,
		width: '100%',
		height: '100%',
		objectFit: 'cover',
		opacity: layerOpacity,
		transform: `translateX(${whipTranslateX}px) scale(${scale}) rotate(${rotation}deg) translate(${translateX}px, ${translateY}px)`,
		// Hook-Blur bleibt isotrop, Whip-Blur kommt als horizontaler SVG-Smear obendrauf.
		filter: `brightness(${brightness}) blur(${blur}px) ${whipFilterCss}`.trim(),
		...style,
	};

	return (
		<>
			{whipFilterSvg}
			<Img
				src={src}
				style={imgStyle}
				onError={() => {
					console.warn(`⚠️ Image slide not found: ${src}`);
					onError?.();
				}}
			/>
		</>
	);
};
