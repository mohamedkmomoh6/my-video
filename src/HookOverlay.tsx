import {loadFont} from '@remotion/google-fonts/Montserrat';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {BACKGROUND, PRIMARY} from './style-constants';

const {fontFamily} = loadFont('normal', {
	weights: ['900'],
});

type HookOverlayProps = {
	text: string;
};

export const HookOverlay: React.FC<HookOverlayProps> = ({text}) => {
	const currentFrame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const shortSide = Math.min(width, height);
	const responsiveFontSize = Math.max(56, Math.min(104, Math.round(shortSide * 0.082)));

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
				backgroundColor: BACKGROUND,
				boxShadow: `inset 0 0 0 9999px rgba(0, 0, 0, 0.8)`,
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
					color: PRIMARY,
					WebkitTextStroke: '2px rgba(0, 0, 0, 0.9)',
					textShadow:
						'0 0 18px rgba(255, 215, 0, 0.75), 0 0 36px rgba(255, 215, 0, 0.55), 0 10px 24px rgba(0, 0, 0, 0.75)',
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};
