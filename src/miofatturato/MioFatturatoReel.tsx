import {AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

import {LimitWarningBanner} from './components/LimitWarningBanner';
import {RevenueCard} from './components/RevenueCard';
import {FORFETTARIO_LIMIT} from './lib/calculations';

const FPS = 30;
const TOTAL_FRAMES = 300;
const INTRO_END = 30;
const GROWTH_END = 180;
const WARNING_START = 180;
const CTA_START = 240;

const TOTAL_START = 40_000;
const TOTAL_END = 92_000;
const START_PERCENT = (TOTAL_START / FORFETTARIO_LIMIT) * 100;
const END_PERCENT = (TOTAL_END / FORFETTARIO_LIMIT) * 100;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const GaugeGraphic: React.FC<{ progress: number; percentuale: number }> = ({progress, percentuale}) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp01(progress));
  const gaugeColor = percentuale >= 85 ? '#ef4444' : percentuale >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-[2rem] border border-white/10 bg-white/7 shadow-[0_16px_80px_rgba(15,23,42,0.25)] backdrop-blur-md">
      <div className="absolute inset-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35" />
      <svg viewBox="0 0 120 120" className="relative h-[180px] w-[180px] drop-shadow-[0_0_24px_rgba(34,211,238,0.25)]">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 60 60)"
        />
        <circle cx="60" cy="60" r="22" fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.12)" />
        <text x="60" y="56" textAnchor="middle" className="fill-white text-[16px] font-black">
          {Math.round(percentuale)}%
        </text>
        <text x="60" y="73" textAnchor="middle" className="fill-cyan-100/75 text-[7px] font-semibold uppercase tracking-[0.25em]">
          limite
        </text>
      </svg>

      <div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-white/80">
        <span className="text-cyan-200">LIVE</span>
        <span>•</span>
        <span>dashboard</span>
      </div>
    </div>
  );
};

const DashboardGraphic: React.FC<{ progress: number; percentuale: number }> = ({progress, percentuale}) => {
  const height = 128;
  const widths = [18, 28, 24, 36, 30, 44, 34, 52, 38, 60];
  const bars = widths.map((barHeight, index) => {
    const active = clamp01((progress - index * 0.09) / 0.12);
    const h = 20 + active * (barHeight - 20);
    const fill = percentuale >= 85 ? 'bg-red-500' : percentuale >= 70 ? 'bg-amber-400' : 'bg-emerald-400';

    return (
      <div
        key={index}
        className="flex w-8 items-end justify-center rounded-full bg-white/8"
        style={{height: `${height}px`}}
      >
        <div
          className={`w-4 rounded-full ${fill}`}
          style={{height: `${h}%`, minHeight: 12}}
        />
      </div>
    );
  });

  const linePoints = Array.from({length: 6}, (_, index) => {
    const x = 8 + index * 18;
    const y = 78 - progress * (index === 0 ? 0 : index * 6 + 8);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/7 p-5 shadow-[0_16px_80px_rgba(15,23,42,0.25)] backdrop-blur-md">
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-500/20 blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.16),transparent_28%)]" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Live status</p>
          <p className="mt-2 text-sm font-medium text-white/70">Progressione anno corrente</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/80">
          {percentuale.toFixed(1)}%
        </div>
      </div>

      <div className="mt-5 grid grid-cols-10 gap-2">{bars}</div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/45">Start</p>
          <p className="mt-1 text-sm font-black text-emerald-300">€40k</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/45">Proiezione</p>
          <p className="mt-1 text-sm font-black text-cyan-200">€92k</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/45">Limite</p>
          <p className={`mt-1 text-sm font-black ${percentuale >= 85 ? 'text-red-300' : percentuale >= 70 ? 'text-amber-300' : 'text-emerald-300'}`}>
            €85k
          </p>
        </div>
      </div>

      <svg viewBox="0 0 120 100" className="mt-5 h-24 w-full overflow-visible">
        <defs>
          <linearGradient id="miofatturatoLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor={percentuale >= 85 ? '#ef4444' : percentuale >= 70 ? '#f59e0b' : '#22c55e'} />
          </linearGradient>
        </defs>
        <polyline
          points={linePoints}
          fill="none"
          stroke="url(#miofatturatoLine)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        {Array.from({length: 6}, (_, index) => {
          const x = 8 + index * 18;
          const y = 78 - progress * (index === 0 ? 0 : index * 6 + 8);
          return <circle key={index} cx={x} cy={y} r="2.8" fill="#fff" opacity="0.95" />;
        })}
      </svg>
    </div>
  );
};

const MetricsRibbon: React.FC<{ progress: number }> = ({progress}) => {
  const items = [
    { label: 'fatturato', value: '€ 40k → € 92k' },
    { label: 'limite', value: '85k' },
    { label: 'alert', value: progress > 0.7 ? 'ON' : 'READY' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item, index) => {
        const offset = interpolate(progress, [0, 1], [0, index * 8]);
        return (
          <div
            key={item.label}
            className="rounded-[1.25rem] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-md"
            style={{ transform: `translateY(${offset * 0.15}px)` }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">{item.label}</p>
            <p className="mt-2 text-sm font-black text-white">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
};

export const MioFatturatoReel: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const total =
    frame < INTRO_END
      ? TOTAL_START
      : interpolate(frame, [INTRO_END, GROWTH_END], [TOTAL_START, TOTAL_END], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  const percentuale =
    frame < INTRO_END
      ? interpolate(frame, [0, INTRO_END], [0, START_PERCENT], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : interpolate(frame, [INTRO_END, GROWTH_END], [START_PERCENT, END_PERCENT], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  const introOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const revenueFade = interpolate(frame, [224, CTA_START], [1, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bannerSpring = spring({
    fps,
    frame: Math.max(0, frame - WARNING_START),
    config: {
      damping: 14,
      stiffness: 140,
      mass: 0.8,
    },
  });

  const bannerOpacity = interpolate(bannerSpring, [0, 1], [0, 1]);
  const bannerScale = interpolate(bannerSpring, [0, 1], [0.8, 1]);

  const ctaSpring = spring({
    fps,
    frame: Math.max(0, frame - CTA_START),
    config: {
      damping: 13,
      stiffness: 150,
      mass: 0.9,
    },
  });

  const ctaOpacity = interpolate(ctaSpring, [0, 1], [0, 1]);
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.86, 1]);

  return (
    <AbsoluteFill className="relative overflow-hidden bg-slate-950 text-white">
      <Img
        src={staticFile('hintergrund.png')}
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <AbsoluteFill className="absolute inset-0 bg-gradient-to-b from-slate-950/15 via-slate-950/50 to-slate-950/88" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -right-20 top-44 h-80 w-80 rounded-full bg-indigo-500/18 blur-3xl" />
        <div className="absolute bottom-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-between px-10 py-12">
        <Sequence durationInFrames={CTA_START}>
          <div
            className="w-full max-w-[820px]"
            style={{
              opacity: introOpacity * revenueFade,
            }}
          >
            <div className="mb-5 flex items-center justify-between text-white/80">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-200/90">
                  MioFatturato
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-tight">Controlla il tuo limite forfettario</h2>
              </div>
              <div className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium backdrop-blur-md">
                Reel storyboard · 10s
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
              <div className="space-y-4">
                <RevenueCard totale={total} percentuale={percentuale} />
                <MetricsRibbon progress={introOpacity * revenueFade} />
              </div>
              <div className="space-y-4">
                <GaugeGraphic progress={introOpacity * revenueFade} percentuale={percentuale} />
                <DashboardGraphic progress={introOpacity * revenueFade} percentuale={percentuale} />
              </div>
            </div>
          </div>
        </Sequence>

        <Sequence from={WARNING_START} durationInFrames={60}>
          <div
            className="w-full max-w-[860px]"
            style={{
              opacity: bannerOpacity,
              transform: `scale(${bannerScale})`,
              transformOrigin: 'top center',
            }}
          >
            <LimitWarningBanner percentualeLimite={percentuale} totaleAnno={total} />
          </div>
        </Sequence>

        <Sequence from={CTA_START} durationInFrames={60}>
          <div
            className="flex w-full flex-1 items-center justify-center"
            style={{
              opacity: ctaOpacity,
              transform: `scale(${ctaScale})`,
              transformOrigin: 'center',
            }}
          >
            <div className="w-full max-w-[760px] rounded-[2rem] border border-white/15 bg-white/10 p-10 text-center shadow-[0_24px_120px_rgba(15,23,42,0.5)] backdrop-blur-xl">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/15 bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 shadow-lg shadow-cyan-500/30">
                <svg viewBox="0 0 64 64" className="h-14 w-14 text-white">
                  <path d="M16 44V20l12 12 8-8 12 20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 48h36" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </div>

              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.4em] text-cyan-200/90">
                Installa MioFatturato
              </p>
              <h3 className="mt-4 text-5xl font-black tracking-tight text-white">
                Tutto il tuo fatturato, chiaro in un colpo d&apos;occhio.
              </h3>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/78">
                Limite, margine residuo e allerta fiscale in un solo video-dashboard: pronto da
                condividere con clienti e commercialista.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <div className="rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-950">
                  Scarica l&apos;app
                </div>
                <div className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-base font-semibold text-white/90">
                  Osserva il limite in tempo reale
                </div>
              </div>
            </div>
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

export const MioFatturatoReelConfig = {
  durationInFrames: TOTAL_FRAMES,
  fps: FPS,
  width: 1080,
  height: 1920,
} as const;