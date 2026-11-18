import React, { useEffect, useRef, useState } from 'react';
import { Check, Layers, Play, RotateCcw, X } from 'lucide-react';
import type { Scene, TransitionType } from '../types/studio';
import { TRANSITION_PRESETS } from '../types/studio';
import {
  drawTransitionBlend,
  preloadProjectImages,
} from '../utils/videoCompositor';

interface TransitionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  targetSceneId: string;
  onSelectTargetScene: (sceneId: string) => void;
  onApplyToScene: (
    sceneId: string,
    transition: TransitionType,
    durationSec: number
  ) => void;
  onApplyToAllScenes: (
    transition: TransitionType,
    durationSec: number
  ) => void;
}

export const TransitionEditor: React.FC<TransitionEditorProps> = ({
  isOpen,
  onClose,
  scenes,
  targetSceneId,
  onSelectTargetScene,
  onApplyToScene,
  onApplyToAllScenes,
}) => {
  const targetIdx = Math.max(
    0,
    scenes.findIndex((s) => s.id === targetSceneId)
  );
  const targetScene = scenes[targetIdx] || scenes[0];
  const prevScene = targetIdx > 0 ? scenes[targetIdx - 1] : targetScene;

  const [selectedTransition, setSelectedTransition] = useState<TransitionType>(
    targetScene?.transition || 'crossfade'
  );
  const [durationSec, setDurationSec] = useState<number>(
    targetScene?.transitionDurationSec ?? 0.55
  );
  const [categoryFilter, setCategoryFilter] = useState<
    'Semua' | 'Halus' | 'Geometris' | 'Dinamis'
  >('Semua');
  const [replayNonce, setReplayNonce] = useState(0);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!targetScene) return;
    setSelectedTransition(targetScene.transition);
    setDurationSec(targetScene.transitionDurationSec ?? 0.55);
    setAppliedBanner(null);
  }, [targetScene?.id]);

  useEffect(() => {
    if (!isOpen || !targetScene) return;
    let cancelled = false;
    let rafId = 0;

    preloadProjectImages(scenes).then((cache) => {
      if (cancelled) return;

      const canvas = previewCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const w = 640;
      const h = 360;
      canvas.width = w;
      canvas.height = h;

      const holdBefore = 0.45;
      const holdAfter = 0.65;
      const cycleDuration = holdBefore + durationSec + holdAfter;
      const startWall = performance.now();

      const renderLoop = (now: number) => {
        if (cancelled) return;
        const elapsed = ((now - startWall) / 1000) % cycleDuration;

        let tr = 0;
        if (elapsed < holdBefore) {
          tr = 0;
        } else if (elapsed < holdBefore + durationSec) {
          tr = (elapsed - holdBefore) / durationSec;
        } else {
          tr = 1;
        }

        ctx.clearRect(0, 0, w, h);
        const prevImg = cache.get(prevScene.brollUrl);
        const nextImg = cache.get(targetScene.brollUrl);

        drawTransitionBlend(
          ctx,
          selectedTransition,
          tr,
          prevImg,
          nextImg,
          prevScene.kenBurns,
          targetScene.kenBurns,
          Math.max(0, targetIdx - 1),
          targetIdx,
          Math.min(0.25, tr * 0.25),
          w,
          h
        );

        rafId = requestAnimationFrame(renderLoop);
      };

      rafId = requestAnimationFrame(renderLoop);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    isOpen,
    scenes,
    targetScene,
    prevScene,
    targetIdx,
    selectedTransition,
    durationSec,
    replayNonce,
  ]);

  if (!isOpen || !targetScene) return null;

  const filteredPresets = TRANSITION_PRESETS.filter(
    (p) => categoryFilter === 'Semua' || p.category === categoryFilter
  );

  const selectedMeta =
    TRANSITION_PRESETS.find((p) => p.id === selectedTransition) ||
    TRANSITION_PRESETS[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transition-editor-title"
      className="fixed inset-0 z-50 bg-[#0F172A]/40 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-4xl overflow-hidden shadow-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="transition-editor-title"
              className="font-display text-sm font-semibold text-[#0F172A] flex items-center gap-1.5"
            >
              <Layers className="w-4 h-4 text-[#2563EB]" />
              <span>Editor Transisi</span>
            </h2>
            <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
              · {targetIdx > 0
                ? `${String(targetIdx).padStart(2, '0')} → ${String(targetIdx + 1).padStart(2, '0')} (${targetScene.title})`
                : `Pembuka 01 (${targetScene.title})`}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup editor transisi"
            className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scene Strip Selector */}
        <div className="px-5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {scenes.map((sc, idx) => {
            const isTarget = sc.id === targetScene.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectTargetScene(sc.id)}
                className={`h-7 px-2.5 rounded text-xs font-medium whitespace-nowrap shrink-0 border ${
                  isTarget
                    ? 'bg-[#2563EB] text-white border-[#2563EB]'
                    : 'bg-white text-[#334155] border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                {String(idx + 1).padStart(2, '0')} · {sc.title}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto">
          {/* Left: Preview & Duration */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-[#0F172A] rounded-lg overflow-hidden border border-[#1E293B]">
              <canvas
                ref={previewCanvasRef}
                className="w-full aspect-video block"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#0F172A]">
                {selectedMeta.name}
              </span>
              <button
                type="button"
                onClick={() => setReplayNonce((n) => n + 1)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Ulang</span>
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="transition-duration-slider"
                  className="font-medium text-[#334155]"
                >
                  Durasi Transisi
                </label>
                <span className="font-mono font-semibold text-[#2563EB] tabular-nums">
                  {durationSec.toFixed(2)}d
                </span>
              </div>
              <input
                id="transition-duration-slider"
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
            </div>
          </div>

          {/* Right: Compact Presets Grid */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0F172A]">
                Gaya Transisi
              </span>
              <div className="inline-flex items-center gap-0.5 p-0.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-md">
                {(['Semua', 'Halus', 'Geometris', 'Dinamis'] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2 py-1 text-[11px] font-medium rounded ${
                        categoryFilter === cat
                          ? 'bg-white text-[#0F172A]'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredPresets.map((preset) => {
                const isSelected = selectedTransition === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedTransition(preset.id);
                      setDurationSec(preset.defaultDurationSec);
                    }}
                    title={preset.description}
                    className={`p-2.5 rounded-lg border text-left space-y-1 ${
                      isSelected
                        ? 'bg-[#EFF6FF] border-[#2563EB]'
                        : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0F172A]">
                        {preset.name}
                      </span>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      ) : (
                        <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
                          {preset.defaultDurationSec.toFixed(2)}d
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#64748B] line-clamp-1">
                      {preset.category} · {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {appliedBanner && (
              <div className="p-2.5 rounded-md bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-medium text-[#15803D]">
                {appliedBanner}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              onApplyToAllScenes(selectedTransition, durationSec);
              setAppliedBanner(
                `"${selectedMeta.name}" (${durationSec.toFixed(2)}d) diterapkan ke ${scenes.length} adegan.`
              );
            }}
            className="h-8 px-3 text-xs font-medium text-[#0F172A] bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md whitespace-nowrap"
          >
            Terapkan ke Semua ({scenes.length})
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyToScene(targetScene.id, selectedTransition, durationSec);
                onClose();
              }}
              className="h-8 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Terapkan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
