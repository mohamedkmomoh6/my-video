import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {PRIMARY} from './style-constants';

export const ProgressBar: React.FC = () => {
	const currentFrame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();

	// Berechne den Fortschritt des Balkens basierend auf dem aktuellen Frame
	const progressPercentage = interpolate(
		currentFrame,
		[0, durationInFrames],
		[0, 100],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
	);

	return (
		<div
			style={{
				width: '100%',
				maxWidth: '500px',
				height: '6px',
				backgroundColor: 'rgba(255, 255, 255, 0.2)',
				borderRadius: '3px',
				overflow: 'hidden',
				margin: '0 auto',
			}}
		>
			{/* Innerer Fortschrittsbalken */}
			<div
				style={{
					width: `${progressPercentage}%`,
					height: '100%',
					backgroundColor: PRIMARY,
					boxShadow: `0 0 15px ${PRIMARY}`,
					transition: 'width 0.05s linear',
				}}
			/>
		</div>
	);
};
