import { type ReactNode, useEffect, useRef, useState } from 'react';
import { formatTime, loadMarks, type StepMarks, setMark, stepFrames } from './reference-video';

type Props = {
  techniqueId: string;
  stepIndex: number;
  /** The 3D view. */
  children: ReactNode;
};

type Mode = 'side' | 'over';

const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage);
const button = 'rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50';

/**
 * A demonstration video next to or over the 3D view, to place the joints on a real technique.
 * The file is picked locally and stays in the browser (never uploaded). Each step can be linked
 * to a moment of the video: selecting the step brings the video to that moment.
 */
export function ReferenceVideo({ techniqueId, stepIndex, children }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('side');
  const [opacity, setOpacity] = useState(0.45);
  const [marks, setMarks] = useState<StepMarks>(() => loadMarks(techniqueId, storage()));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Free the file's memory when it is replaced or the editor closes.
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  // Selecting a step brings the video to the moment linked to it.
  const mark = marks[stepIndex];
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mark === undefined) return;
    video.pause();
    video.currentTime = mark;
  }, [mark]);

  const seek = (t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = t;
  };
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };
  const link = (t: number | null) =>
    setMarks((m) => setMark(techniqueId, m, stepIndex, t, storage()));

  const video = url && (
    // biome-ignore lint/a11y/useMediaCaption: a silent reference clip the admin chose, not site content
    <video
      ref={videoRef}
      src={url}
      muted
      playsInline
      preload="auto"
      className={
        mode === 'over'
          ? 'pointer-events-none absolute inset-0 h-full w-full rounded-lg object-contain'
          : 'aspect-video w-full rounded-lg bg-black object-contain'
      }
      style={mode === 'over' ? { opacity } : undefined}
      onLoadedMetadata={(e) => {
        setDuration(e.currentTarget.duration);
        if (mark !== undefined) e.currentTarget.currentTime = mark;
      }}
      onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      onSeeked={(e) => setTime(e.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
    />
  );

  return (
    <div>
      {url && mode === 'side' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>{children}</div>
          {video}
        </div>
      ) : (
        <div className="relative">
          {children}
          {video}
        </div>
      )}

      <section aria-label="Vidéo de référence" className="mt-2 rounded border border-slate-200 p-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="font-medium">
            Vidéo de référence{' '}
            <input
              type="file"
              accept="video/*"
              className="text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUrl(URL.createObjectURL(file));
                setName(file.name);
                setTime(0);
              }}
            />
          </label>
          {url && (
            <button type="button" className={button} onClick={() => setUrl(null)}>
              Retirer
            </button>
          )}
        </div>
        {url ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <fieldset className="flex gap-1">
                <legend className="sr-only">Affichage</legend>
                {(
                  [
                    ['side', 'À côté'],
                    ['over', 'Superposée'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    className={`${button} ${mode === value ? 'bg-slate-800 text-white' : ''}`}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              {mode === 'over' && (
                <label className="ml-2 flex items-center gap-1 text-xs">
                  Transparence
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(e.target.valueAsNumber)}
                  />
                </label>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={button}
                onClick={() => seek(stepFrames(time, -10, duration))}
              >
                −10 img
              </button>
              <button
                type="button"
                className={button}
                onClick={() => seek(stepFrames(time, -1, duration))}
              >
                −1 img
              </button>
              <button type="button" className={button} onClick={togglePlay}>
                {playing ? 'Pause' : 'Lecture'}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => seek(stepFrames(time, 1, duration))}
              >
                +1 img
              </button>
              <button
                type="button"
                className={button}
                onClick={() => seek(stepFrames(time, 10, duration))}
              >
                +10 img
              </button>
              <span className="ml-1 font-mono text-xs">
                {formatTime(time)} / {formatTime(duration)}
              </span>
            </div>
            <input
              type="range"
              aria-label="Position dans la vidéo"
              className="mt-1 w-full"
              min={0}
              max={duration || 0}
              step={1 / 30}
              value={time}
              onChange={(e) => seek(e.target.valueAsNumber)}
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <button type="button" className={button} onClick={() => link(time)}>
                Lier ce moment à l'étape {stepIndex + 1}
              </button>
              {mark !== undefined && (
                <>
                  <span>
                    Étape {stepIndex + 1} : {formatTime(mark)}
                  </span>
                  <button type="button" className={button} onClick={() => link(null)}>
                    Délier
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {name} reste dans ton navigateur (jamais envoyée). En « Superposée », tourne la caméra
              pour retrouver l'angle de la vidéo, puis cale les articulations dessus. Les moments
              sont liés par numéro d'étape : insérer une étape décale les suivants.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-600">
            Choisis une vidéo de démonstration pour placer les articulations d'après elle.
          </p>
        )}
      </section>
    </div>
  );
}
