import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import type { Scene } from '../types/studio';
import { formatTimecode } from '../utils/videoCompositor';

interface TeleprompterOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  activeSceneId: string;
  onSelectScene: (sceneId: string) => void;
}

export const TeleprompterOverlay: React.FC<TeleprompterOverlayProps> = ({
  isOpen,
  onClose,
  scenes,
  activeSceneId,
  onSelectScene,
}) => {
  const [scope, setScope] = useState<'scene' | 'all'>('scene');
  const [isScrolling, setIsScrolling] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(48);
  const [fontSize, setFontSize] = useState(52);
  const [maxWidthMode, setMaxWidthMode] = useState<'narrow' | 'medium' | 'wide'>('medium');
  const [mirrored, setMirrored] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollPosRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const activeIndex = Math.max(
    0,
    scenes.findIndex((s) => s.id === activeSceneId)
  );
  const currentScene = scenes[activeIndex] || scenes[0];

  const resetScroll = useCallback(() => {
    setIsScrolling(false);
    setCountdown(null);
    setElapsedSec(0);
    scrollPosRef.current = 0;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetScroll();
    } else {
      setIsScrolling(false);
      setCountdown(null);
    }
  }, [isOpen, activeSceneId, scope, resetScroll]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setIsScrolling(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 850);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!isOpen || !isScrolling) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    scrollPosRef.current = container.scrollTop;
    lastFrameRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      setElapsedSec((prev) => prev + dt);

      const maxScroll = container.scrollHeight - container.clientHeight;
      if (scrollPosRef.current >= maxScroll - 1) {
        setIsScrolling(false);
        return;
      }

      scrollPosRef.current = Math.min(
        maxScroll,
        scrollPosRef.current + speed * dt
      );
      container.scrollTop = scrollPosRef.current;
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isOpen, isScrolling, speed]);

  const handleManualScroll = () => {
    if (scrollContainerRef.current && !isScrolling) {
      scrollPosRef.current = scrollContainerRef.current.scrollTop;
    }
  };

  const handleTogglePlay = useCallback(() => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (isScrolling) {
      setIsScrolling(false);
      return;
    }
    const container = scrollContainerRef.current;
    const atTop = !container || container.scrollTop < 8;
    if (atTop) {
      setCountdown(3);
    } else {
      setIsScrolling(true);
    }
  }, [countdown, isScrolling]);

  useEffect(() => {
    const onFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement && rootRef.current) {
        await rootRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if blocked in iframe
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onClose();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetScroll();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSpeed((s) => Math.min(180, s + 8));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSpeed((s) => Math.max(12, s - 8));
      } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        onSelectScene(scenes[activeIndex - 1].id);
      } else if (e.key === 'ArrowRight' && activeIndex < scenes.length - 1) {
        e.preventDefault();
        onSelectScene(scenes[activeIndex + 1].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, handleTogglePlay, resetScroll, activeIndex, scenes, onSelectScene]);

  if (!isOpen || !currentScene) return null;

  const displayedScenes = scope === 'scene' ? [currentScene] : scenes;
  const widthClass =
    maxWidthMode === 'narrow'
      ? 'max-w-2xl'
      : maxWidthMode === 'wide'
        ? 'max-w-5xl'
        : 'max-w-3xl';

  const btnSurface = lightTheme
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9]'
    : 'bg-[#1E293B] border-[#334155] text-[#F8FAFC] hover:bg-[#334155]';

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Mode Teleprompter"
      className={`fixed inset-0 z-50 flex flex-col ${
        lightTheme
          ? 'bg-white text-[#090D16]'
          : 'bg-[#090D16] text-[#F8FAFC]'
      }`}
    >
      {/* Compact Control Toolbar */}
      <div
        className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2.5 shrink-0 ${
          lightTheme
            ? 'bg-[#F8FAFC] border-[#E2E8F0]'
            : 'bg-[#0F172A] border-[#1E293B]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => onSelectScene(scenes[activeIndex - 1].id)}
              aria-label="Adegan sebelumnya"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md border disabled:opacity-35 ${btnSurface}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono tabular-nums whitespace-nowrap">
              <strong>{String(activeIndex + 1).padStart(2, '0')}</strong>
              <span className={lightTheme ? 'text-[#64748B]' : 'text-[#94A3B8]'}>
                /{String(scenes.length).padStart(2, '0')} · {currentScene.title}
              </span>
            </span>
            <button
              type="button"
              disabled={activeIndex >= scenes.length - 1}
              onClick={() => onSelectScene(scenes[activeIndex + 1].id)}
              aria-label="Adegan berikutnya"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md border disabled:opacity-35 ${btnSurface}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div
            className={`inline-flex p-0.5 rounded-md border ${
              lightTheme
                ? 'bg-white border-[#E2E8F0]'
                : 'bg-[#090D16] border-[#334155]'
            }`}
          >
            <button
              type="button"
              onClick={() => setScope('scene')}
              className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap ${
                scope === 'scene'
                  ? 'bg-[#2563EB] text-white'
                  : lightTheme
                    ? 'text-[#475569]'
                    : 'text-[#94A3B8]'
              }`}
            >
              Adegan Aktif
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap ${
                scope === 'all'
                  ? 'bg-[#2563EB] text-white'
                  : lightTheme
                    ? 'text-[#475569]'
                    : 'text-[#94A3B8]'
              }`}
            >
              Semua
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold whitespace-nowrap"
          >
            {isScrolling ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Jeda</span>
              </>
            ) : countdown !== null ? (
              <span>Mulai {countdown}...</span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Mulai (Spasi)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetScroll}
            title="Reset posisi (R)"
            aria-label="Reset posisi"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border ${btnSurface}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div
            className={`h-8 px-2 inline-flex items-center gap-1.5 rounded-md border text-[11px] ${btnSurface}`}
          >
            <button
              type="button"
              onClick={() => setSpeed((s) => Math.max(12, s - 8))}
              aria-label="Kurangi kecepatan"
              className="p-0.5 hover:text-[#2563EB]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono tabular-nums w-12 text-center font-semibold">
              {speed}px/d
            </span>
            <button
              type="button"
              onClick={() => setSpeed((s) => Math.min(180, s + 8))}
              aria-label="Tambah kecepatan"
              className="p-0.5 hover:text-[#2563EB]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div
            className={`h-8 px-2 inline-flex items-center gap-1.5 rounded-md border text-[11px] ${btnSurface}`}
          >
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.max(28, f - 4))}
              aria-label="Perkecil teks"
              className="p-0.5 hover:text-[#2563EB]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono tabular-nums w-8 text-center font-semibold">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.min(84, f + 4))}
              aria-label="Perbesar teks"
              className="p-0.5 hover:text-[#2563EB]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline px-1.5 font-mono text-[11px] tabular-nums">
            {formatTimecode(elapsedSec)}
          </span>

          <button
            type="button"
            onClick={() =>
              setMaxWidthMode((m) =>
                m === 'narrow' ? 'medium' : m === 'medium' ? 'wide' : 'narrow'
              )
            }
            className={`h-8 px-2 text-[11px] font-medium rounded-md border whitespace-nowrap ${btnSurface}`}
            title="Ubah lebar kolom"
          >
            {maxWidthMode === 'narrow'
              ? 'Sempit'
              : maxWidthMode === 'wide'
                ? 'Lebar'
                : 'Sedang'}
          </button>

          <button
            type="button"
            onClick={() => setMirrored((v) => !v)}
            aria-pressed={mirrored}
            title="Cermin Horizontal"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border ${
              mirrored ? 'bg-[#2563EB] border-[#2563EB] text-white' : btnSurface
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setLightTheme((v) => !v)}
            title="Kontras Gelap / Terang"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border ${btnSurface}`}
          >
            {lightTheme ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={toggleBrowserFullscreen}
            title="Layar Penuh"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border ${btnSurface}`}
          >
            {isBrowserFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              onClose();
            }}
            aria-label="Tutup mode teleprompter"
            className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-md border text-xs font-semibold ${btnSurface}`}
          >
            <X className="w-3.5 h-3.5" />
            <span>Tutup</span>
          </button>
        </div>
      </div>

      {/* Reading Stage */}
      <div className="relative flex-1 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[28%] z-10 flex items-center"
        >
          <div className="w-3.5 h-3.5 ml-4 border-y-2 border-l-2 border-[#2563EB]" />
          <div className="flex-1 h-px bg-[#2563EB]/35" />
          <div className="w-3.5 h-3.5 mr-4 border-y-2 border-r-2 border-[#2563EB]" />
        </div>

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="w-24 h-24 rounded-xl bg-[#2563EB] text-white font-mono text-5xl font-bold flex items-center justify-center tabular-nums">
              {countdown}
            </div>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleManualScroll}
          className="h-full overflow-y-auto px-6 sm:px-10"
        >
          <div
            className={`mx-auto ${widthClass} pt-[28vh] pb-[62vh] space-y-14`}
            style={{
              transform: mirrored ? 'scaleX(-1)' : undefined,
            }}
          >
            {displayedScenes.map((sc) => {
              const sceneNumber = scenes.findIndex((item) => item.id === sc.id) + 1;
              return (
                <section key={sc.id} className="space-y-3">
                  <div
                    className={`text-xs font-mono tracking-wide ${
                      lightTheme ? 'text-[#2563EB]' : 'text-[#60A5FA]'
                    }`}
                  >
                    ADEGAN {String(sceneNumber).padStart(2, '0')} · {sc.title} · {sc.durationSec}d
                  </div>

                  <p
                    className="font-display font-semibold leading-[1.38] tracking-tight whitespace-pre-wrap"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {sc.narration}
                  </p>

                  {sc.visualDirection && (
                    <p
                      className={`text-sm font-normal pt-1 ${
                        lightTheme ? 'text-[#64748B]' : 'text-[#94A3B8]'
                      }`}
                    >
                      Visual: {sc.visualDirection}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Shortcuts Hint */}
      <div
        className={`px-4 py-1.5 border-t text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 shrink-0 ${
          lightTheme
            ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
            : 'bg-[#0F172A] border-[#1E293B] text-[#94A3B8]'
        }`}
      >
        <span>Spasi: Putar/Jeda · Atas/Bawah: Kecepatan · Kiri/Kanan: Adegan</span>
        <span>R: Reset · Esc: Keluar</span>
      </div>
    </div>
  );
};
