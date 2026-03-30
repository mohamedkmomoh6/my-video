import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const FilmGrain: React.FC = () => {
	const frame = useCurrentFrame();

	const offsetX = (frame * 17) % 120;
	const offsetY = (frame * 23) % 120;

	return (
		<AbsoluteFill
			style={{
				zIndex: 980,
				opacity: 0.025,
				pointerEvents: 'none',
				backgroundImage:
					'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.9) 0 0.6px, transparent 0.8px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.8) 0 0.6px, transparent 0.8px), radial-gradient(circle at 40% 80%, rgba(0,0,0,0.9) 0 0.7px, transparent 0.9px), radial-gradient(circle at 85% 20%, rgba(0,0,0,0.85) 0 0.6px, transparent 0.8px)',
				backgroundSize: '120px 120px, 140px 140px, 110px 110px, 130px 130px',
				backgroundPosition: `${offsetX}px ${offsetY}px, ${-offsetY}px ${offsetX}px, ${offsetY}px ${-offsetX}px, ${-offsetX}px ${-offsetY}px`,
				mixBlendMode: 'overlay',
			}}
		/>
	);
};
