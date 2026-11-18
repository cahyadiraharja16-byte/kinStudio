import React, { useEffect, useRef, useState } from 'react';
import {
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Film,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import type { AspectRatio, Project, SrtCue } from '../types/studio';
import {
  computeTimeline,
  cuesToSrtString,
  exportProjectToVideo,
  formatTimecode,
  generateScriptMarkdown,
  generateSrtContent,
  getExportDimensions,
} from '../utils/videoCompositor';

interface ExportModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProject?: (patch: Partial<Project>) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  isOpen,
  onClose,
  onUpdateProject,
}) => {
  const [quality, setQuality] = useState<'4k' | '1080p' | '720p'>('4k');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspectRatio);
  const [fps, setFps] = useState<30 | 60>(30);
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [localCues, setLocalCues] = useState<SrtCue[] | null>(
    project.srtCues ?? null
  );
  const [audioSyncedCount, setAudioSyncedCount] = useState<number | null>(null);
  const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
  const [srtError, setSrtError] = useState<string | null>(null);
  const [showSrtPreview, setShowSrtPreview] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<string>('webm');
  const [resultSizeMb, setResultSizeMb] = useState<string>('0');

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setAspectRatio(project.aspectRatio);
  }, [project.id, project.aspectRatio]);

  useEffect(() => {
    setLocalCues(project.srtCues ?? null);
  }, [project.id, project.srtCues]);

  if (!isOpen) return null;

  const { totalDurationSec } = computeTimeline(project.scenes);
  const dims = getExportDimensions(aspectRatio, quality);
  const ttsReadyCount = project.scenes.filter((s) => Boolean(s.ttsAudioUrl)).length;
  const activeCues = localCues && localCues.length > 0 ? localCues : null;
  const activeSrtText = activeCues
    ? cuesToSrtString(activeCues)
    : generateSrtContent(project);

  const handleGenerateAiSrt = async () => {
    setIsGeneratingSrt(true);
    setSrtError(null);
    try {
      const res = await fetch('/api/ai/generate-srt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          scenes: project.scenes,
        }),
      });
      const data = (await res.json()) as {
        cues?: SrtCue[];
        srtText?: string;
        audioSyncedScenes?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat subtitle AI (.SRT).');
      }
      const generatedCues = data.cues || [];
      setLocalCues(generatedCues);
      setAudioSyncedCount(
        typeof data.audioSyncedScenes === 'number' ? data.audioSyncedScenes : null
      );
      onUpdateProject?.({ srtCues: generatedCues });
      setShowSrtPreview(true);
    } catch (err) {
      setSrtError(
        err instanceof Error ? err.message : 'Gagal menyusun subtitle AI (.SRT).'
      );
    } finally {
      setIsGeneratingSrt(false);
    }
  };

  const handleStartVideoExport = async () => {
    setIsExporting(true);
    setProgressPct(2);
    setStatusText('Menyiapkan pipeline render video...');
    setExportError(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const exportProject: Project = {
        ...project,
        aspectRatio,
        srtCues: activeCues ?? project.srtCues,
      };
      const res = await exportProjectToVideo({
        project: exportProject,
        quality,
        fps,
        burnSubtitles,
        subtitleCues: activeCues ?? undefined,
        abortSignal: controller.signal,
        onProgress: (pct, text) => {
          setProgressPct(pct);
          setStatusText(text);
        },
      });

      const url = URL.createObjectURL(res.blob);
      setResultUrl(url);
      setResultExt(res.extension);
      setResultSizeMb((res.blob.size / (1024 * 1024)).toFixed(2));
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Gagal merender ekspor video.'
      );
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleDownloadText = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const slug =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'kinescript-video';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-[#0F172A]/40 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl overflow-hidden shadow-sm">
        {/* Compact Header */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="export-modal-title"
              className="font-display text-sm font-semibold text-[#0F172A]"
            >
              Ekspor Master Video & Paket Produksi
            </h2>
            <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
              · {project.scenes.length} Adegan · {formatTimecode(totalDurationSec)} · {dims.label} ({fps} fps)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (abortRef.current) abortRef.current.abort();
              onClose();
            }}
            aria-label="Tutup jendela ekspor"
            className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Format & Quality Presets */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: '4k', title: '4K Ultra HD', detail: '24 Mbps · Pro' },
                  { id: '1080p', title: '1080p Full HD', detail: '10 Mbps · Standar' },
                  { id: '720p', title: '720p HD', detail: '5 Mbps · Ringan' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setQuality(item.id)}
                  className={`p-2.5 rounded-lg border text-left ${
                    quality === item.id
                      ? 'bg-[#EFF6FF] border-[#2563EB]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#0F172A]">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-[#64748B]">{item.detail}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Platform & Rasio Layar
                </label>
                <select
                  disabled={isExporting}
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="w-full h-8 px-2.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] outline-none focus:border-[#2563EB]"
                >
                  <option value="16:9">16:9 Landscape (YouTube 4K)</option>
                  <option value="9:16">9:16 Vertikal (TikTok · Reels · Shorts)</option>
                  <option value="4:5">4:5 Potret Feed (Instagram · LinkedIn)</option>
                  <option value="1:1">1:1 Persegi (Feed Sosial)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Frame Rate
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([30, 60] as const).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      disabled={isExporting}
                      onClick={() => setFps(rate)}
                      className={`h-8 text-xs font-mono font-semibold rounded-md border ${
                        fps === rate
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-[#F8FAFC] text-[#0F172A] border-[#E2E8F0]'
                      }`}
                    >
                      {rate} fps
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Compact AI SRT & Burn-in Panel */}
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                  <Captions className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Subtitle AI (.SRT) & Burn-in</span>
                </div>
                <p className="text-[11px] text-[#64748B] font-mono tabular-nums mt-0.5">
                  {ttsReadyCount}/{project.scenes.length} audio TTS
                  {activeCues
                    ? ` · ${activeCues.length} segmen SRT AI${
                        audioSyncedCount !== null ? ` (${audioSyncedCount} sinkron WAV)` : ''
                      }`
                    : ' · belum disinkron AI'}
                </p>
              </div>

              <button
                type="button"
                disabled={isGeneratingSrt || isExporting || project.scenes.length === 0}
                onClick={handleGenerateAiSrt}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] bg-white hover:bg-[#EFF6FF] border border-[#CBD5E1] rounded-md disabled:opacity-50"
              >
                {isGeneratingSrt ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                    <span>Menyelaraskan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>{activeCues ? 'Perbarui SRT AI' : 'Buat Subtitle AI'}</span>
                  </>
                )}
              </button>
            </div>

            {srtError && (
              <div className="p-2 rounded bg-[#FEF2F2] border border-[#FECACA] text-[11px] text-[#B91C1C]">
                {srtError}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-[#E2E8F0]">
              <div>
                <div
                  id="burn-subtitles-label"
                  className="text-xs font-medium text-[#0F172A]"
                >
                  Sematkan Subtitle ke Video (Burn-in)
                </div>
                <p className="text-[11px] text-[#64748B]">
                  {burnSubtitles
                    ? activeCues
                      ? 'Membakar segmen Subtitle AI (.SRT) pada frame video.'
                      : 'Membakar teks narasi otomatis (buat SRT AI untuk presisi audio).'
                    : 'Video dirender bersih tanpa teks subtitle tempel.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={burnSubtitles}
                aria-labelledby="burn-subtitles-label"
                disabled={isExporting}
                onClick={() => setBurnSubtitles((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50 ${
                  burnSubtitles ? 'bg-[#2563EB]' : 'bg-[#CBD5E1]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white ${
                    burnSubtitles ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {activeCues && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSrtPreview((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB] hover:underline"
                >
                  {showSrtPreview ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Tutup pratinjau .SRT</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Pratinjau {activeCues.length} segmen .SRT</span>
                    </>
                  )}
                </button>
                {showSrtPreview && (
                  <pre className="mt-2 p-2.5 max-h-32 overflow-y-auto rounded bg-white border border-[#E2E8F0] text-[11px] font-mono text-[#334155] whitespace-pre-wrap">
                    {activeSrtText}
                  </pre>
                )}
              </div>
            )}
          </div>

          {isExporting && (
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#0F172A] flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                  <span>{statusText}</span>
                </span>
                <span className="font-mono font-semibold text-[#2563EB] tabular-nums">
                  {progressPct}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-[#E2E8F0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2563EB]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {exportError && (
            <div className="p-2.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
              {exportError}
            </div>
          )}

          {resultUrl && (
            <div className="p-3 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Selesai ({dims.label} · {resultSizeMb} MB · .{resultExt})
                  </span>
                </div>
                <a
                  href={resultUrl}
                  download={`${slug}-${quality}.${resultExt}`}
                  className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Video</span>
                </a>
              </div>
              <video
                src={resultUrl}
                controls
                className="w-full max-h-52 rounded bg-black"
              />
            </div>
          )}

          {/* Grouped Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[#E2E8F0]">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  handleDownloadText(
                    activeSrtText,
                    `${slug}.srt`,
                    'text/plain;charset=utf-8'
                  )
                }
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md"
              >
                <FileText className="w-3.5 h-3.5 text-[#475569]" />
                <span>{activeCues ? '.SRT (AI)' : '.SRT'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadText(
                    generateScriptMarkdown(project),
                    `${slug}-naskah.md`,
                    'text/markdown;charset=utf-8'
                  )
                }
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md"
              >
                <FileText className="w-3.5 h-3.5 text-[#475569]" />
                <span>.MD</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadText(
                    JSON.stringify(project, null, 2),
                    `${slug}-proyek.json`,
                    'application/json;charset=utf-8'
                  )
                }
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md"
              >
                <FileText className="w-3.5 h-3.5 text-[#475569]" />
                <span>.JSON</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleStartVideoExport}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] rounded-md"
            >
              <Film className="w-3.5 h-3.5" />
              <span>
                {isExporting
                  ? 'Merender...'
                  : `Render ${quality === '4k' ? '4K' : quality.toUpperCase()}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
