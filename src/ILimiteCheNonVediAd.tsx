import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FC } from 'react';

export interface ILimiteCheNonVediAdConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export const ILimiteCheNonVediAdConfig: ILimiteCheNonVediAdConfig = {
  durationInFrames: 300, // 10 seconds at 30fps
  fps: 30,
  width: 1080,
  height: 1920, // TikTok format
};

const SVG_SLIDES = [
  'Il_Limite_Che_Non_Vedi/1.svg',
  'Il_Limite_Che_Non_Vedi/2.svg',
  'Il_Limite_Che_Non_Vedi/3.svg',
  'Il_Limite_Che_Non_Vedi/4.svg',
  'Il_Limite_Che_Non_Vedi/5.svg',
  'Il_Limite_Che_Non_Vedi/6.svg',
  'Il_Limite_Che_Non_Vedi/7.svg',
];

const FRAMES_PER_SLIDE = 40; // Each slide gets 40 frames
const TRANSITION_DURATION = 10; // 10 frames for fade transitions

interface SlideProps {
  index: number;
  svgPath: string;
}

const Slide: FC<SlideProps> = ({ index, svgPath }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideStartFrame = index * FRAMES_PER_SLIDE;
  const slideEndFrame = slideStartFrame + FRAMES_PER_SLIDE;

  // Calculate opacity with smooth fade in/out
  const fadeInProgress = interpolate(
    frame,
    [slideStartFrame, slideStartFrame + TRANSITION_DURATION],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const fadeOutProgress = interpolate(
    frame,
    [slideEndFrame - TRANSITION_DURATION, slideEndFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(fadeInProgress, fadeOutProgress);

  // Scale animation
  const scale = interpolate(
    frame,
    [slideStartFrame, slideStartFrame + TRANSITION_DURATION, slideEndFrame - TRANSITION_DURATION, slideEndFrame],
    [0.8, 1, 1, 0.9],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Slight rotation for dynamic feel
  const rotation = interpolate(
    frame,
    [slideStartFrame, slideEndFrame],
    [0, 2],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
      }}
    >
      <Img
        src={staticFile(svgPath)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Advertisement Video for "Il Limite Che Non Vedi" (The Limit You Don't See)
 * Animates through 7 SVG slides with smooth transitions and zoom effects
 */
export const ILimiteCheNonVediAd: FC = () => {
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Animated SVG slides */}
      {SVG_SLIDES.map((svgPath, index) => (
        <Sequence key={svgPath} from={index * FRAMES_PER_SLIDE}>
          <Slide index={index} svgPath={svgPath} />
        </Sequence>
      ))}

      {/* Subtle vignette effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
