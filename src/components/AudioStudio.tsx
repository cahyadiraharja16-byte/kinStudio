import React, { useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Sliders,
  Volume2,
} from 'lucide-react';
import type { Project, VoiceName } from '../types/studio';
import { MUSIC_PRESETS, VOICE_PERSONAS } from '../types/studio';
import { renderMusicBuffer } from '../utils/musicEngine';

interface AudioStudioProps {
  project: Project;
  onUpdateProject: (patch: Partial<Project>) => void;
  onGenerateSceneTts: (sceneId: string) => Promise<void>;
  onGenerateAllTts: () => Promise<void>;
  generatingTtsSceneId: string | null;
  isBatchGeneratingTts: boolean;
  ttsError: string | null;
}

export const AudioStudio: React.FC<AudioStudioProps> = ({
  project,
  onUpdateProject,
  onGenerateSceneTts,
  onGenerateAllTts,
  generatingTtsSceneId,
  isBatchGeneratingTts,
  ttsError,
}) => {
  const [playingSceneAudioId, setPlayingSceneAudioId] = useState<string | null>(
    null
  );
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const musicCtxRef = useRef<AudioContext | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const toggleSceneAudio = (sceneId: string, url: string) => {
    if (playingSceneAudioId === sceneId && audioElRef.current) {
      audioElRef.current.pause();
      setPlayingSceneAudioId(null);
      return;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
    }
    const el = new Audio(url);
    audioElRef.current = el;
    el.onended = () => setPlayingSceneAudioId(null);
    el.play().catch(() => setPlayingSceneAudioId(null));
    setPlayingSceneAudioId(sceneId);
  };

  const stopMusicPreview = () => {
    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.stop();
      } catch {
        // ignore
      }
      musicSourceRef.current = null;
    }
    if (musicCtxRef.current) {
      musicCtxRef.current.close().catch(() => {});
      musicCtxRef.current = null;
    }
    setPreviewingMusicId(null);
  };

  const toggleMusicPreview = async (presetId: string) => {
    if (previewingMusicId === presetId) {
      stopMusicPreview();
      return;
    }
    stopMusicPreview();
    if (presetId === 'tanpa-musik') return;

    try {
      const ctx = new AudioContext();
      musicCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      setPreviewingMusicId(presetId);
      const buf = await renderMusicBuffer(ctx, presetId, 10);
      if (!buf || musicCtxRef.current !== ctx) {
        stopMusicPreview();
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = Math.max(0.25, project.musicVolume);
      src.connect(g);
      g.connect(ctx.destination);
      src.onended = () => stopMusicPreview();
      src.start();
      musicSourceRef.current = src;
    } catch {
      stopMusicPreview();
    }
  };

  const completedTtsCount = project.scenes.filter((s) => Boolean(s.ttsAudioUrl)).length;

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* LEFT: Compact TTS Studio */}
      <section className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            className="font-display text-sm font-semibold text-[#0F172A] flex items-center gap-1.5"
            title="Pilih karakter vokal, sesuaikan arahan intonasi, lalu render suara per adegan"
          >
            <Mic className="w-4 h-4 text-[#2563EB]" />
            <span>Studio Teks-ke-Suara (TTS)</span>
          </h2>

          <button
            type="button"
            disabled={isBatchGeneratingTts || project.scenes.length === 0}
            onClick={onGenerateAllTts}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] rounded-md whitespace-nowrap"
          >
            {isBatchGeneratingTts ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Merender...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Render Semua ({completedTtsCount}/{project.scenes.length})</span>
              </>
            )}
          </button>
        </div>

        {/* Compact Voice Selector Grid */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-[#475569]">
            Karakter Suara Pembawa Acara
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {VOICE_PERSONAS.map((voice) => {
              const selected = project.voiceName === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  title={voice.defaultStyle}
                  onClick={() =>
                    onUpdateProject({
                      voiceName: voice.id as VoiceName,
                      voiceStylePrompt: voice.defaultStyle,
                    })
                  }
                  className={`p-2 rounded-md border text-left ${
                    selected
                      ? 'bg-[#EFF6FF] border-[#2563EB]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-[#0F172A]">
                      {voice.label}
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-[#2563EB]" />}
                  </div>
                  <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                    {voice.character}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#475569] mb-1">
            Arahan Gaya Bicara & Intonasi
          </label>
          <input
            type="text"
            value={project.voiceStylePrompt}
            onChange={(e) =>
              onUpdateProject({ voiceStylePrompt: e.target.value })
            }
            placeholder="Misal: Hangat, tempo sedang, penekanan jelas pada angka & poin kunci..."
            className="w-full h-8 px-2.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] focus:bg-white focus:border-[#2563EB] outline-none"
          />
        </div>

        {ttsError && (
          <div className="p-2.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
            {ttsError}
          </div>
        )}

        {/* Dense Per-Scene TTS Table */}
        <div className="border border-[#E2E8F0] rounded-md overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-medium text-[#475569]">
                <th className="py-2 px-3 w-10">#</th>
                <th className="py-2 px-2">Adegan & Narasi</th>
                <th className="py-2 px-2 w-32">Status</th>
                <th className="py-2 px-3 w-40 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {project.scenes.map((sc, idx) => {
                const isRendering = generatingTtsSceneId === sc.id;
                const isPlayingThis = playingSceneAudioId === sc.id;
                return (
                  <tr key={sc.id} className="hover:bg-[#F8FAFC]/60">
                    <td className="py-2 px-3 font-mono font-semibold text-[#64748B] tabular-nums align-top">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2 px-2 align-top">
                      <div className="font-semibold text-[#0F172A]">{sc.title}</div>
                      <p className="text-[11px] text-[#64748B] line-clamp-1 mt-0.5">
                        {sc.narration}
                      </p>
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] tabular-nums align-top whitespace-nowrap">
                      {sc.ttsAudioUrl ? (
                        <span className="text-[#15803D]">
                          {sc.ttsVoiceName || project.voiceName} · {sc.ttsDurationSec || sc.durationSec}d
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">Belum ada</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right align-top whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {sc.ttsAudioUrl && (
                          <button
                            type="button"
                            onClick={() => toggleSceneAudio(sc.id, sc.ttsAudioUrl!)}
                            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded"
                          >
                            {isPlayingThis ? (
                              <Pause className="w-3 h-3" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            <span>{isPlayingThis ? 'Jeda' : 'Putar'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isRendering || isBatchGeneratingTts}
                          onClick={() => onGenerateSceneTts(sc.id)}
                          className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded"
                        >
                          {isRendering ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#2563EB]" />
                          ) : (
                            <Mic className="w-3 h-3 text-[#2563EB]" />
                          )}
                          <span>{sc.ttsAudioUrl ? 'Ulang' : 'Render'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* RIGHT: Compact Music & Mixing */}
      <section className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3.5">
        <h2
          className="font-display text-sm font-semibold text-[#0F172A] flex items-center gap-1.5"
          title="Musik disintesis adaptif sesuai durasi video dan otomatis merunduk saat narasi berbicara"
        >
          <Music className="w-4 h-4 text-[#2563EB]" />
          <span>Musik Latar & Balancing</span>
        </h2>

        {/* 2-Column Mixer */}
        <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0F172A]">
            <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Mixer Master</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#475569]">Narasi (TTS)</span>
                <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                  {Math.round(project.voiceVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.2}
                step={0.05}
                value={project.voiceVolume}
                onChange={(e) =>
                  onUpdateProject({ voiceVolume: Number(e.target.value) })
                }
                className="w-full accent-[#2563EB]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#475569]">Musik Latar</span>
                <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                  {Math.round(project.musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.02}
                value={project.musicVolume}
                onChange={(e) =>
                  onUpdateProject({ musicVolume: Number(e.target.value) })
                }
                className="w-full accent-[#2563EB]"
              />
            </div>
          </div>
        </div>

        {/* Compact Music Presets List */}
        <div className="divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-md overflow-hidden">
          {MUSIC_PRESETS.map((preset) => {
            const isSelected = project.musicPresetId === preset.id;
            const isPreviewing = previewingMusicId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => onUpdateProject({ musicPresetId: preset.id })}
                className={`p-3 cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#EFF6FF]'
                    : 'bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                    <span className="font-semibold text-[#0F172A]">
                      {preset.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{preset.mood}</span>
                    {preset.bpm > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] tabular-nums">
                          {preset.bpm} BPM
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-[#64748B] truncate" title={preset.description}>
                    {preset.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {preset.id !== 'tanpa-musik' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMusicPreview(preset.id);
                      }}
                      className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded hover:bg-[#F8FAFC]"
                    >
                      {isPreviewing ? (
                        <Pause className="w-3 h-3 text-[#2563EB]" />
                      ) : (
                        <Play className="w-3 h-3 text-[#2563EB]" />
                      )}
                      <span>{isPreviewing ? 'Jeda' : 'Dengar'}</span>
                    </button>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-[#2563EB]" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
