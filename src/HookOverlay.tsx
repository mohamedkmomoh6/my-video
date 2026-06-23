import {loadFont} from '@remotion/google-fonts/Montserrat';
import {
	AbsoluteFill,
	continueRender,
	delayRender,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {getAccentColorByPreset, PRIMARY_GLOW_RGB} from './style-constants';

const {fontFamily, waitUntilDone} = loadFont('normal', {
	weights: ['900'],
});

const handle = delayRender('Montserrat Font - HookOverlay');
waitUntilDone()
	.then(() => {
		continueRender(handle);
	})
	.catch((err) => {
		console.error('Failed to load Montserrat font for HookOverlay:', err);
		continueRender(handle);
	});

type HookOverlayProps = {
	text: string;
	captionStylePreset?: string;
};

export const HookOverlay: React.FC<HookOverlayProps> = ({text, captionStylePreset}) => {
	const currentFrame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const shortSide = Math.min(width, height);
	const responsiveFontSize = Math.max(56, Math.min(104, Math.round(shortSide * 0.082)));
	const accentColor = getAccentColorByPreset(captionStylePreset);
	const hookGlow =
		captionStylePreset === 'performanceOptimizer'
			? `0 0 20px ${accentColor}, 0 0 40px ${accentColor}88, 0 10px 24px rgba(0, 0, 0, 0.78)`
			: `0 0 18px rgba(${PRIMARY_GLOW_RGB}, 0.75), 0 0 36px rgba(${PRIMARY_GLOW_RGB}, 0.55), 0 10px 24px rgba(0, 0, 0, 0.75)`;

	if (!text) {
		return null;
	}

	const opacity = interpolate(currentFrame, [0, 50, 60], [1, 1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const springValue = spring({
		fps,
		frame: currentFrame,
		config: {
			damping: 10,
			stiffness: 260,
			mass: 0.65,
		},
	});

	const scale = interpolate(springValue, [0, 0.65, 1], [0.72, 1.18, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const translateY = interpolate(springValue, [0, 1], [130, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				zIndex: 20,
				justifyContent: 'center',
				alignItems: 'center',
				opacity,
				pointerEvents: 'none',
				padding: '0 88px',
				background:
					'linear-gradient(180deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.18) 55%, rgba(0, 0, 0, 0.08) 100%)',
			}}
		>
			<div
				style={{
					transform: `translateY(${translateY}px) scale(${scale})`,
					textAlign: 'center',
					width: '100%',
					maxWidth: '88%',
					fontFamily: `${fontFamily}, sans-serif`,
					fontWeight: 900,
					fontSize: responsiveFontSize,
					lineHeight: 1.05,
					letterSpacing: '-0.02em',
					textTransform: 'uppercase',
					overflowWrap: 'anywhere',
					wordBreak: 'break-word',
					whiteSpace: 'normal',
					color: accentColor,
					WebkitTextStroke: '2px rgba(0, 0, 0, 0.9)',
					textShadow: hookGlow,
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};
