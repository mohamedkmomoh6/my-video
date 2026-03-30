import {useMemo} from 'react';
import {useAudioData, visualizeAudio} from '@remotion/media-utils';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type AudioVisualizerProps = {
	src?: string;
	bars?: number;
	bottomOffset?: number | string;
	opacity?: number;
	zIndex?: number;
	widthScale?: number;
};

const nextPowerOfTwo = (value: number): number => {
	let power = 1;
	while (power < value) {
		power <<= 1;
	}
	return power;
};

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
	src = staticFile('assets/music.mp3'),
	bars = 24,
	bottomOffset = '12%',
	opacity = 0.15,
	zIndex = 1,
	widthScale = 0.99,
}) => {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const audioData = useAudioData(src);
	const halfBars = Math.ceil(bars / 2);
	const analysisSamples = nextPowerOfTwo(halfBars);

	const visualizerWidth = Math.max(240, Math.round(width * widthScale));
	const dynamicGap = Math.max(3, Math.min(10, Math.round(visualizerWidth / (bars * 6.5))));
	const computedBarWidth = Math.floor((visualizerWidth - (bars - 1) * dynamicGap) / bars);
	const barWidth = Math.max(4, Math.min(16, computedBarWidth));
	const auraBarWidth = Math.round(barWidth * 1.25);
	const auraGap = Math.max(2, Math.round(dynamicGap * 0.9));
	const auraVisualizerWidth = bars * auraBarWidth + (bars - 1) * auraGap;

	const samples = useMemo(() => {
		if (!audioData) {
			return new Array(halfBars).fill(0.05);
		}

		const rawSamples = visualizeAudio({
			audioData,
			fps,
			frame,
			numberOfSamples: analysisSamples,
		});

		return Array.from({length: halfBars}, (_, index) => {
			const mappedIndex = Math.floor((index / halfBars) * rawSamples.length);
			const clampedIndex = Math.min(rawSamples.length - 1, mappedIndex);
			return rawSamples[clampedIndex];
		});
	}, [analysisSamples, audioData, halfBars, fps, frame]);

	const mirroredSamples = useMemo(() => {
		if (bars % 2 === 0) {
			return [...samples.slice().reverse(), ...samples];
		}

		const rightSide = samples.slice(0, -1);
		return [...rightSide.slice().reverse(), ...samples];
	}, [bars, samples]);

	return (
		<AbsoluteFill
			style={{
				zIndex,
				opacity,
				justifyContent: 'flex-end',
				alignItems: 'center',
				paddingBottom: bottomOffset,
				pointerEvents: 'none',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-end',
					justifyContent: 'center',
					gap: auraGap,
					height: 56,
					width: auraVisualizerWidth,
				}}
			>
				{mirroredSamples.map((sample, index) => {
					const normalized = Math.max(0.05, Math.min(1, Math.abs(sample)));
					const barHeight = 8 + normalized * 48;

					return (
						<div
							key={`bar-${index}`}
							style={{
								width: auraBarWidth,
								height: barHeight,
								backgroundColor: '#FFD700',
								borderRadius: 999,
								opacity: 1,
								boxShadow: '0 0 24px rgba(255, 215, 0, 0.55)',
							}}
						/>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
