import {getAudioDurationInSeconds} from '@remotion/media-utils';
import {Composition, staticFile} from 'remotion';
import { MyComposition } from './Composition';
import {type CaptionStylePresetConfig} from './caption-style-presets';

const subtitleGapPresets = {
  natural: 0.3,
  balanced: 0.1,
  aggressive: 0,
} as const;

const SPEED_PRESETS = {
  aggressive: 1.2,
  balanced: 2.0,
  natural: 2.8,
} as const;

const END_FADE_OUT_FRAMES = 15;

type SpeedMode = keyof typeof subtitleGapPresets;

const getSafeSpeedMode = (speedMode?: string): SpeedMode => {
  if (speedMode === 'aggressive' || speedMode === 'balanced' || speedMode === 'natural') {
    return speedMode;
  }

  return 'balanced';
};

const getSafeCaptionStylePreset = (preset?: string): string => {
  if (typeof preset === 'string' && preset.trim().length > 0) {
    return preset;
  }

  return 'tiktok';
};

const getSafeImageFolder = (folder?: string): string | undefined => {
  if (typeof folder === 'string' && folder.trim().length > 0) {
    return folder;
  }

  return undefined;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyComposition}
        defaultProps={{
          audioID: 'voiceover',
          speedMode: 'balanced',
          gapThreshold: subtitleGapPresets.balanced,
          chunkWindowSeconds: SPEED_PRESETS.balanced,
          captionStylePreset: 'performanceOptimizer',
          autoScaleExtremeWords: true,
          debugCaptions: false,
          imageFolder: undefined,
          slideCount: 5,
          slideTypes: undefined,
        }}
        calculateMetadata={async ({props}) => {
          const rawAudioID = typeof props.audioID === 'string' && props.audioID.length > 0 ? props.audioID : 'voiceover';
          const audioID = rawAudioID;
          const speedMode = getSafeSpeedMode(typeof props.speedMode === 'string' ? props.speedMode : undefined);
          const gapThreshold = subtitleGapPresets[speedMode];
          const chunkWindowSeconds = SPEED_PRESETS[speedMode] ?? SPEED_PRESETS.balanced;
          const captionStylePreset = getSafeCaptionStylePreset(
            typeof props.captionStylePreset === 'string' ? props.captionStylePreset : undefined,
          );
          const captionStylePresets =
            props.captionStylePresets && typeof props.captionStylePresets === 'object'
              ? (props.captionStylePresets as Record<string, CaptionStylePresetConfig>)
              : undefined;
          const autoScaleExtremeWords =
            typeof props.autoScaleExtremeWords === 'boolean' ? props.autoScaleExtremeWords : true;
          const debugCaptions = typeof props.debugCaptions === 'boolean' ? props.debugCaptions : false;
          const imageFolder = getSafeImageFolder(
            typeof props.imageFolder === 'string' ? props.imageFolder : undefined,
          );

          const slideCount = typeof props.slideCount === 'number' ? Math.max(1, props.slideCount) : 5;
          const slideTypes = Array.isArray(props.slideTypes) ? props.slideTypes : undefined;

          const checkStaticFileExists = async (relativePath: string): Promise<boolean> => {
            const url = staticFile(relativePath);

            try {
              const headResponse = await fetch(url, {method: 'HEAD'});
              if (headResponse.ok) {
                return true;
              }

              if (headResponse.status === 405) {
                const getResponse = await fetch(url);
                return getResponse.ok;
              }

              return false;
            } catch {
              return false;
            }
          };

          const transcriptExists = await checkStaticFileExists(`${audioID}.json`);
          if (!transcriptExists) {
            throw new Error(
              `❌ Abbruch: Die Transkription (${rawAudioID}.json) fehlt. Starte zuerst 'python3 transcribe_audio.py'!`,
            );
          }

          const audioExists = await checkStaticFileExists(`${audioID}.mp3`);
          if (!audioExists) {
            throw new Error(
              `❌ Abbruch: Die Audio-Datei (${audioID}.mp3) fehlt. Lege sie in den public/-Ordner und starte den Render erneut.`,
            );
          }

          const durationInSeconds = await getAudioDurationInSeconds(staticFile(`${audioID}.mp3`));
          const durationInFrames = Math.max(
            1,
            Math.ceil(durationInSeconds * 30) + END_FADE_OUT_FRAMES,
          );

          return {
            durationInFrames,
            props: {
              ...props,
              audioID,
              speedMode,
              gapThreshold,
              chunkWindowSeconds,
              captionStylePreset,
              captionStylePresets,
              autoScaleExtremeWords,
              debugCaptions,
              imageFolder,
              slideCount,
              slideTypes,
            },
          };
        }}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};