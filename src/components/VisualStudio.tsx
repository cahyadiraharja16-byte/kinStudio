import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Layers,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sliders,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  CentralAsset,
  KenBurnsDirection,
  MotionGraphicType,
  Project,
  Scene,
  TransitionType,
} from '../types/studio';
import { MUSIC_PRESETS, TRANSITION_PRESETS } from '../types/studio';
import { renderMusicBuffer } from '../utils/musicEngine';
import {
  computeTimeline,
  formatTimecode,
  preloadProjectImages,
  renderCompositorFrame,
} from '../utils/videoCompositor';
import { TransitionEditor } from './TransitionEditor';

interface VisualStudioProps {
  project: Project;
  assets: CentralAsset[];
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  onUpdateProject: (patch: Partial<Project>) => void;
}

const fieldClass =
  'w-full h-8 px-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] focus:bg-white focus:border-[#2563EB] outline-none';

export const VisualStudio: React.FC<VisualStudioProps> = ({
  project,
  assets,
  selectedSceneId,
  onSelectScene,
  onUpdateScene,
  onUpdateProject,
}) => {
  const { timed, totalDurationSec } = computeTimeline(project.scenes);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  interface BrollSuggestionView {
    assetId: string;
    reason: string;
    recommendedKenBurns: KenBurnsDirection;
    asset: CentralAsset;
  }

  const [brollSuggestionsByScene, setBrollSuggestionsByScene] = useState<
    Record<string, BrollSuggestionView[]>
  >({});
  const [isSuggestingBroll, setIsSuggestingBroll] = useState(false);
  const [brollSuggestError, setBrollSuggestError] = useState<string | null>(null);
  const [isTransitionEditorOpen, setIsTransitionEditorOpen] = useState(false);
  const [transitionEditorSceneId, setTransitionEditorSceneId] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef<number>(0);
  const playStartWallRef = useRef<number>(0);
  const playStartOffsetRef = useRef<number>(0);

  const canvasDims =
    project.aspectRatio === '9:16'
      ? { w: 540, h: 960 }
      : project.aspectRatio === '1:1'
        ? { w: 720, h: 720 }
        : project.aspectRatio === '4:5'
          ? { w: 576, h: 720 }
          : { w: 960, h: 540 };

  useEffect(() => {
    let cancelled = false;
    preloadProjectImages(project.scenes).then((cache) => {
      if (cancelled) return;
      imageCacheRef.current = cache;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        renderCompositorFrame(
          ctx,
          project,
          currentTime,
          canvasDims.w,
          canvasDims.h,
          cache
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, canvasDims.w, canvasDims.h]);

  useEffect(() => {
    if (isPlaying) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderCompositorFrame(
        ctx,
        project,
        currentTime,
        canvasDims.w,
        canvasDims.h,
        imageCacheRef.current
      );
    }
  }, [currentTime, isPlaying, project, canvasDims.w, canvasDims.h]);

  const stopAudioPlayback = () => {
    audioNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch {
        // ignore
      }
    });
    audioNodesRef.current = [];
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopAudioPlayback();
    };
  }, []);

  const startPlayback = async (fromTime: number) => {
    stopAudioPlayback();
    const offset = fromTime >= totalDurationSec - 0.05 ? 0 : fromTime;
    setCurrentTime(offset);
    setIsPlaying(true);

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const startAt = ctx.currentTime + 0.04;
      const musicBuf = await renderMusicBuffer(
        ctx,
        project.musicPresetId,
        totalDurationSec
      );

      if (musicBuf && audioCtxRef.current === ctx) {
        const src = ctx.createBufferSource();
        src.buffer = musicBuf;
        const g = ctx.createGain();
        const hasTts = project.scenes.some((s) => Boolean(s.ttsAudioUrl));
        g.gain.value = hasTts
          ? Math.max(0.08, project.musicVolume * 0.55)
          : project.musicVolume;
        src.connect(g);
        g.connect(ctx.destination);
        src.start(startAt, offset);
        audioNodesRef.current.push(src);
      }

      for (const item of timed) {
        if (!item.scene.ttsAudioUrl || item.endSec <= offset) continue;
        try {
          const res = await fetch(item.scene.ttsAudioUrl);
          if (!res.ok || audioCtxRef.current !== ctx) continue;
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          if (audioCtxRef.current !== ctx) continue;

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          g.gain.value = project.voiceVolume;
          src.connect(g);
          g.connect(ctx.destination);

          if (item.startSec >= offset) {
            src.start(startAt + (item.startSec - offset), 0);
          } else {
            const clipOffset = offset - item.startSec;
            if (clipOffset < buf.duration) {
              src.start(startAt, clipOffset);
            }
          }
          audioNodesRef.current.push(src);
        } catch {
          // Skip unavailable clip
        }
      }
    } catch {
      // Silent fallback
    }

    playStartWallRef.current = performance.now();
    playStartOffsetRef.current = offset;

    const tick = () => {
      const elapsed = (performance.now() - playStartWallRef.current) / 1000;
      const nextTime = playStartOffsetRef.current + elapsed;

      if (nextTime >= totalDurationSec) {
        setCurrentTime(0);
        setIsPlaying(false);
        stopAudioPlayback();
        return;
      }

      setCurrentTime(nextTime);
      const canvas = canvasRef.current;
      const ctx2d = canvas?.getContext('2d');
      if (canvas && ctx2d) {
        renderCompositorFrame(
          ctx2d,
          project,
          nextTime,
          canvasDims.w,
          canvasDims.h,
          imageCacheRef.current
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const pausePlayback = () => {
    cancelAnimationFrame(rafRef.current);
    stopAudioPlayback();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback(currentTime);
    }
  };

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(totalDurationSec - 0.01, sec));
    if (isPlaying) {
      pausePlayback();
    }
    setCurrentTime(clamped);
    const matched = timed.find(
      (t) => clamped >= t.startSec && clamped < t.endSec
    );
    if (matched) onSelectScene(matched.scene.id);
  };

  const activeScene =
    project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0];
  const visualAssets = assets.filter(
    (a) => a.category === 'broll' || a.category === 'upload'
  );
  const currentMusic = MUSIC_PRESETS.find((m) => m.id === project.musicPresetId);

  const handleSuggestBroll = async (scene: Scene) => {
    setIsSuggestingBroll(true);
    setBrollSuggestError(null);
    try {
      const res = await fetch('/api/ai/suggest-broll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneTitle: scene.title,
          narration: scene.narration,
          visualDirection: scene.visualDirection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyarankan B-roll.');
      }
      setBrollSuggestionsByScene((prev) => ({
        ...prev,
        [scene.id]: data.suggestions || [],
      }));
    } catch (err) {
      setBrollSuggestError(
        err instanceof Error
          ? err.message
          : 'Gagal menganalisis narasi adegan.'
      );
    } finally {
      setIsSuggestingBroll(false);
    }
  };

  const activeSuggestions = activeScene
    ? brollSuggestionsByScene[activeScene.id] || []
    : [];

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT/CENTER: Compact Canvas Compositor */}
        <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <h2 className="font-display text-[13px] font-semibold text-[#0F172A]">
                Monitor Komposisi
              </h2>
              <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
              <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
                {canvasDims.w}×{canvasDims.h}
              </span>
            </div>

            <div className="inline-flex items-center p-0.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-md">
              {(['16:9', '9:16', '4:5', '1:1'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onUpdateProject({ aspectRatio: ratio })}
                  className={`h-6 px-2 text-[11px] font-mono rounded ${
                    project.aspectRatio === ratio
                      ? 'bg-white text-[#0F172A] font-semibold'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0F172A] rounded-md p-2.5 flex items-center justify-center min-h-[290px] max-h-[380px] overflow-hidden">
            <canvas
              ref={canvasRef}
              width={canvasDims.w}
              height={canvasDims.h}
              className="max-w-full max-h-[350px] w-auto h-auto rounded"
            />
          </div>

          {/* Compact Transport Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => seekTo(0)}
                title="Kembali ke awal"
                aria-label="Kembali ke awal"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = timed.findIndex((t) => t.scene.id === activeScene?.id);
                  if (idx > 0) seekTo(timed[idx - 1].startSec);
                }}
                title="Adegan sebelumnya"
                aria-label="Adegan sebelumnya"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A]"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Jeda</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Putar</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = timed.findIndex((t) => t.scene.id === activeScene?.id);
                  if (idx >= 0 && idx < timed.length - 1) {
                    seekTo(timed[idx + 1].startSec);
                  }
                }}
                title="Adegan berikutnya"
                aria-label="Adegan berikutnya"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A]"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
              {formatTimecode(currentTime)}{' '}
              <span className="text-[#94A3B8] font-normal">
                / {formatTimecode(totalDurationSec)}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Dense Scene Inspector */}
        <aside className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
            <h3 className="font-display text-[13px] font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Inspektur Adegan</span>
            </h3>
            {activeScene && (
              <span className="text-[11px] font-mono text-[#64748B] truncate max-w-[160px]">
                {activeScene.title}
              </span>
            )}
          </div>

          {activeScene ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#475569]">
                    Durasi Adegan
                  </label>
                  <span className="text-[11px] font-mono font-semibold text-[#2563EB] tabular-nums">
                    {activeScene.durationSec} detik
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={Math.max(30, activeScene.durationSec)}
                  step={1}
                  value={activeScene.durationSec}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, {
                      durationSec: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#475569] mb-1">
                    Motion Graphic
                  </label>
                  <select
                    value={activeScene.motionGraphic.type}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        motionGraphic: {
                          ...activeScene.motionGraphic,
                          type: e.target.value as MotionGraphicType,
                        },
                      })
                    }
                    className={fieldClass}
                  >
                    <option value="kinetic-title">Kinetic Title</option>
                    <option value="lower-third">Lower Third</option>
                    <option value="stat-callout">Stat Callout</option>
                    <option value="caption-bold">Judul Sorotan</option>
                    <option value="none">Tanpa Grafis</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-[#475569]">
                      Transisi
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTransitionEditorSceneId(activeScene.id);
                        setIsTransitionEditorOpen(true);
                      }}
                      className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                    >
                      Editor
                    </button>
                  </div>
                  <select
                    value={activeScene.transition}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        transition: e.target.value as TransitionType,
                      })
                    }
                    className={fieldClass}
                  >
                    {TRANSITION_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#475569] mb-1">
                    Judul Grafis
                  </label>
                  <input
                    type="text"
                    value={activeScene.motionGraphic.headline}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        motionGraphic: {
                          ...activeScene.motionGraphic,
                          headline: e.target.value,
                        },
                      })
                    }
                    placeholder="Teks utama"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#475569] mb-1">
                    Subjudul Grafis
                  </label>
                  <input
                    type="text"
                    value={activeScene.motionGraphic.subline}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        motionGraphic: {
                          ...activeScene.motionGraphic,
                          subline: e.target.value,
                        },
                      })
                    }
                    placeholder="Keterangan"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Gerakan Kamera (Ken Burns)
                </label>
                <select
                  value={activeScene.kenBurns}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, {
                      kenBurns: e.target.value as KenBurnsDirection,
                    })
                  }
                  className={fieldClass}
                >
                  <option value="zoom-in">Dorong Masuk (Zoom In)</option>
                  <option value="zoom-out">Tarik Keluar (Zoom Out)</option>
                  <option value="pan-left">Geser Kiri (Pan Left)</option>
                  <option value="pan-right">Geser Kanan (Pan Right)</option>
                </select>
              </div>

              {/* AI B-Roll Suggestions */}
              <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold text-[#0F172A]"
                    title="Analisis narasi untuk memilih 3 klip B-roll paling relevan dari pustaka"
                  >
                    Rekomendasi B-Roll AI
                  </span>
                  <button
                    type="button"
                    disabled={isSuggestingBroll || !activeScene.narration.trim()}
                    onClick={() => handleSuggestBroll(activeScene)}
                    className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] rounded-md whitespace-nowrap"
                  >
                    {isSuggestingBroll ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Menganalisis...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3" />
                        <span>{activeSuggestions.length > 0 ? 'Analisis Ulang' : 'Cari 3 B-Roll'}</span>
                      </>
                    )}
                  </button>
                </div>

                {brollSuggestError && (
                  <div className="p-2 rounded bg-[#FEF2F2] border border-[#FECACA] text-[11px] text-[#B91C1C]">
                    {brollSuggestError}
                  </div>
                )}

                {activeSuggestions.length > 0 && (
                  <div className="space-y-1.5">
                    {activeSuggestions.map((item, rankIdx) => {
                      const isApplied = activeScene.brollAssetId === item.asset.id;
                      return (
                        <div
                          key={item.asset.id}
                          className={`p-2 rounded-md border flex items-center gap-2 ${
                            isApplied
                              ? 'bg-[#EFF6FF] border-[#2563EB]'
                              : 'bg-[#F8FAFC] border-[#E2E8F0]'
                          }`}
                        >
                          <img
                            src={item.asset.url}
                            alt={item.asset.name}
                            referrerPolicy="no-referrer"
                            className="w-16 aspect-video rounded object-cover shrink-0 border border-[#E2E8F0]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold text-[#0F172A] truncate">
                              #{rankIdx + 1} · {item.asset.name}
                            </div>
                            <p className="text-[11px] text-[#64748B] truncate" title={item.reason}>
                              {item.reason}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateScene(activeScene.id, {
                                brollAssetId: item.asset.id,
                                brollUrl: item.asset.url,
                                kenBurns: item.recommendedKenBurns,
                              })
                            }
                            className={`h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium rounded border shrink-0 ${
                              isApplied
                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:border-[#2563EB]'
                            }`}
                          >
                            {isApplied && <Check className="w-3 h-3" />}
                            <span>{isApplied ? 'Aktif' : 'Pasang'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-medium text-[#475569] mb-1.5">
                  Pilih Cepat B-Roll
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-3 gap-1.5">
                  {visualAssets.slice(0, 6).map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      title={asset.name}
                      onClick={() =>
                        onUpdateScene(activeScene.id, {
                          brollAssetId: asset.id,
                          brollUrl: asset.url,
                        })
                      }
                      className={`aspect-video rounded overflow-hidden border ${
                        activeScene.brollAssetId === asset.id
                          ? 'border-[#2563EB] ring-1 ring-[#2563EB]'
                          : 'border-[#E2E8F0] opacity-85 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={asset.url}
                        alt={asset.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#64748B]">Pilih adegan pada timeline.</p>
          )}
        </aside>
      </div>

      {/* COMPACT MULTI-TRACK TIMELINE */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <h3 className="font-display text-[13px] font-semibold text-[#0F172A]">
              Timeline Multi-Trek
            </h3>
            <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
            <span className="text-[11px] text-[#64748B] font-mono">
              Musik: {currentMusic?.name || 'Tanpa Musik'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTransitionEditorSceneId(activeScene?.id || project.scenes[0]?.id || '');
              setIsTransitionEditorOpen(true);
            }}
            title="Atur gaya dan durasi transisi antar adegan"
            className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0F172A] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:text-[#2563EB] border border-[#E2E8F0] rounded-md whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Editor Transisi</span>
          </button>
        </div>

        <input
          type="range"
          aria-label="Scrubber waktu timeline"
          min={0}
          max={totalDurationSec}
          step={0.05}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="w-full accent-[#2563EB] cursor-pointer"
        />

        <div className="space-y-1.5 overflow-x-auto pb-0.5">
          {/* V1 Track */}
          <div className="flex items-center gap-2 min-w-[700px]">
            <div className="w-24 shrink-0 text-[11px] font-mono text-[#475569]">
              V1 · Visual
            </div>
            <div className="flex-1 flex items-center gap-1 h-11 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-1">
              {timed.map((item, idx) => {
                const widthPct = ((item.endSec - item.startSec) / totalDurationSec) * 100;
                const isSelected = activeScene?.id === item.scene.id;
                const trPreset = TRANSITION_PRESETS.find(
                  (p) => p.id === item.scene.transition
                );
                return (
                  <React.Fragment key={item.scene.id}>
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectScene(item.scene.id);
                          setTransitionEditorSceneId(item.scene.id);
                          setIsTransitionEditorOpen(true);
                        }}
                        title={`Transisi ${item.scene.title}: ${trPreset?.name || item.scene.transition}`}
                        className="h-8 px-1 shrink-0 rounded bg-white hover:bg-[#EFF6FF] border border-[#CBD5E1] hover:border-[#2563EB] text-[10px] font-mono text-[#475569] hover:text-[#2563EB] flex items-center gap-0.5"
                      >
                        <Layers className="w-2.5 h-2.5" />
                        <span>{(item.scene.transitionDurationSec ?? 0.55).toFixed(1)}d</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => seekTo(item.startSec)}
                      style={{ width: `${widthPct}%` }}
                      className={`relative h-full rounded overflow-hidden border text-left flex items-end ${
                        isSelected
                          ? 'border-[#2563EB] ring-1 ring-[#2563EB]'
                          : 'border-[#CBD5E1] hover:border-[#94A3B8]'
                      }`}
                    >
                      <img
                        src={item.scene.brollUrl}
                        alt={item.scene.title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <span className="relative w-full bg-[#0F172A]/70 px-1.5 py-0.5 text-[10px] font-medium text-white truncate">
                        {String(item.index + 1).padStart(2, '0')} · {item.scene.title}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* M1 Track */}
          <div className="flex items-center gap-2 min-w-[700px]">
            <div className="w-24 shrink-0 text-[11px] font-mono text-[#475569]">
              M1 · Grafis
            </div>
            <div className="flex-1 flex gap-1 h-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-0.5">
              {timed.map((item) => {
                const widthPct = ((item.endSec - item.startSec) / totalDurationSec) * 100;
                const hasMg = item.scene.motionGraphic.type !== 'none';
                return (
                  <button
                    key={item.scene.id}
                    type="button"
                    onClick={() => seekTo(item.startSec)}
                    style={{ width: `${widthPct}%` }}
                    className={`rounded px-1.5 text-[10px] font-medium truncate text-left border ${
                      hasMg
                        ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                        : 'bg-white border-[#E2E8F0] text-[#94A3B8]'
                    }`}
                  >
                    {hasMg
                      ? `${item.scene.motionGraphic.type}: ${item.scene.motionGraphic.headline}`
                      : 'Subtitle saja'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* A1 Track */}
          <div className="flex items-center gap-2 min-w-[700px]">
            <div className="w-24 shrink-0 text-[11px] font-mono text-[#475569]">
              A1 · Narasi
            </div>
            <div className="flex-1 flex gap-1 h-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-0.5">
              {timed.map((item) => {
                const widthPct = ((item.endSec - item.startSec) / totalDurationSec) * 100;
                const hasAudio = Boolean(item.scene.ttsAudioUrl);
                return (
                  <button
                    key={item.scene.id}
                    type="button"
                    onClick={() => seekTo(item.startSec)}
                    style={{ width: `${widthPct}%` }}
                    className={`rounded px-1.5 text-[10px] inline-flex items-center gap-1 truncate border ${
                      hasAudio
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                        : 'bg-white border-dashed border-[#CBD5E1] text-[#64748B]'
                    }`}
                  >
                    <Volume2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">
                      {hasAudio
                        ? `${item.scene.ttsVoiceName || project.voiceName} (${item.scene.ttsDurationSec || item.scene.durationSec}d)`
                        : 'Belum dirender'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* A2 Track */}
          <div className="flex items-center gap-2 min-w-[700px]">
            <div className="w-24 shrink-0 text-[11px] font-mono text-[#475569]">
              A2 · Musik
            </div>
            <div className="flex-1 h-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-0.5 flex items-center">
              <div className="w-full h-full rounded bg-[#F1F5F9] border border-[#E2E8F0] px-2.5 flex items-center justify-between text-[10px] text-[#334155]">
                <span className="font-medium truncate">
                  {currentMusic?.name || 'Tanpa Musik'} · {currentMusic?.mood || 'Hening'}
                </span>
                <span className="font-mono tabular-nums text-[#64748B]">
                  {Math.round(project.musicVolume * 100)}% · Auto-Ducking
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <TransitionEditor
        isOpen={isTransitionEditorOpen}
        onClose={() => setIsTransitionEditorOpen(false)}
        scenes={project.scenes}
        targetSceneId={transitionEditorSceneId || activeScene?.id || ''}
        onSelectTargetScene={(id) => {
          setTransitionEditorSceneId(id);
          onSelectScene(id);
        }}
        onApplyToScene={(sceneId, transition, durationSec) => {
          onUpdateScene(sceneId, {
            transition,
            transitionDurationSec: durationSec,
          });
          const targetTimed = timed.find((t) => t.scene.id === sceneId);
          if (targetTimed) {
            seekTo(targetTimed.startSec);
          }
        }}
        onApplyToAllScenes={(transition, durationSec) => {
          const updatedScenes = project.scenes.map((sc) => ({
            ...sc,
            transition,
            transitionDurationSec: durationSec,
          }));
          onUpdateProject({ scenes: updatedScenes });
        }}
      />
    </div>
  );
};
