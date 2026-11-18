import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  Film,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  AspectRatio,
  CentralAsset,
  CollaboratorPresence,
  HookVariant,
  KenBurnsDirection,
  MotionGraphicType,
  Project,
  Scene,
  TransitionType,
} from '../types/studio';
import { LANGUAGE_STYLES } from '../types/studio';
import {
  computeTimeline,
  formatTimecode,
  preloadProjectImages,
  renderCompositorFrame,
} from '../utils/videoCompositor';
import { TeleprompterOverlay } from './TeleprompterOverlay';

interface ScriptStudioProps {
  project: Project;
  assets: CentralAsset[];
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  presence: CollaboratorPresence[];
  currentClientId: string;
  userName: string;
  onUpdateProject: (patch: Partial<Project>) => void;
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  onCreateScene: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
  onReorderScenes: (sceneIds: string[]) => void;
  onAddComment: (sceneId: string, text: string) => void;
  onResolveComment: (commentId: string, resolved: boolean) => void;
  onGenerateScriptAI: (params: {
    topic: string;
    languageStyle: string;
    aspectRatio: AspectRatio;
    targetDurationSec: number;
    audience: string;
    ctaGoal: string;
  }) => Promise<void>;
  onGenerateFromDocumentAI: (params: {
    rawScript: string;
    fileName?: string;
    languageStyle: string;
    aspectRatio: AspectRatio;
    preserveOriginalText: boolean;
  }) => Promise<void>;
  onGenerateHooksAI: () => Promise<void>;
  onPolishSceneAI: (sceneId: string, instruction: string) => Promise<void>;
  onGenerateSceneTts: (sceneId: string) => Promise<void>;
  isGeneratingScript: boolean;
  isGeneratingHooks: boolean;
  polishingSceneId: string | null;
  generatingTtsSceneId: string | null;
  aiError: string | null;
}

const TRANSITION_OPTIONS: Array<{ value: TransitionType; label: string }> = [
  { value: 'crossfade', label: 'Dissolve' },
  { value: 'slide-wipe', label: 'Slide' },
  { value: 'wipe-vertical', label: 'Wipe Vertikal' },
  { value: 'whip-pan', label: 'Whip Pan' },
  { value: 'zoom-cut', label: 'Zoom Cut' },
  { value: 'iris-reveal', label: 'Iris Reveal' },
  { value: 'film-flash', label: 'Film Flash' },
];

const MOTION_GRAPHIC_OPTIONS: Array<{ value: MotionGraphicType; label: string }> = [
  { value: 'kinetic-title', label: 'Kinetic Title' },
  { value: 'lower-third', label: 'Lower Third' },
  { value: 'stat-callout', label: 'Stat Callout' },
  { value: 'caption-bold', label: 'Judul Sorotan' },
  { value: 'none', label: 'Subtitle Saja' },
];

const KEN_BURNS_OPTIONS: Array<{ value: KenBurnsDirection; label: string }> = [
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'pan-left', label: 'Pan Left' },
  { value: 'pan-right', label: 'Pan Right' },
];

const inputClass =
  'w-full h-8 px-2.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#2563EB] outline-none';

export const ScriptStudio: React.FC<ScriptStudioProps> = ({
  project,
  assets,
  selectedSceneId,
  onSelectScene,
  presence,
  currentClientId,
  onUpdateProject,
  onUpdateScene,
  onCreateScene,
  onDeleteScene,
  onReorderScenes,
  onAddComment,
  onResolveComment,
  onGenerateScriptAI,
  onGenerateFromDocumentAI,
  onGenerateHooksAI,
  onPolishSceneAI,
  onGenerateSceneTts,
  isGeneratingScript,
  isGeneratingHooks,
  polishingSceneId,
  generatingTtsSceneId,
  aiError,
}) => {
  const [generatorMode, setGeneratorMode] = useState<'topic' | 'document'>('topic');
  const [topic, setTopic] = useState(project.topic);
  const [languageStyle, setLanguageStyle] = useState(project.languageStyle);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspectRatio);
  const [targetDurationSec, setTargetDurationSec] = useState(45);
  const [audience, setAudience] = useState(project.audience);
  const [ctaGoal, setCtaGoal] = useState(project.ctaGoal);

  const [rawScriptDoc, setRawScriptDoc] = useState('');
  const [docFileName, setDocFileName] = useState<string>('');
  const [preserveOriginalText, setPreserveOriginalText] = useState(true);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  const [brollPickerSceneId, setBrollPickerSceneId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setTopic(project.topic);
    setLanguageStyle(project.languageStyle);
    setAspectRatio(project.aspectRatio);
    setAudience(project.audience);
    setCtaGoal(project.ctaGoal);
  }, [project.id, project.topic, project.languageStyle, project.aspectRatio, project.audience, project.ctaGoal]);

  const { timed } = computeTimeline(project.scenes);
  const activeTimed =
    timed.find((t) => t.scene.id === selectedSceneId) || timed[0] || null;
  const activeScene = activeTimed?.scene || null;

  useEffect(() => {
    let cancelled = false;
    const canvas = previewCanvasRef.current;
    if (!canvas || !activeTimed) return;

    const w =
      project.aspectRatio === '9:16'
        ? 360
        : project.aspectRatio === '1:1'
          ? 420
          : project.aspectRatio === '4:5'
            ? 360
            : 512;
    const h =
      project.aspectRatio === '9:16'
        ? 640
        : project.aspectRatio === '1:1'
          ? 420
          : project.aspectRatio === '4:5'
            ? 450
            : 288;
    canvas.width = w;
    canvas.height = h;

    preloadProjectImages(project.scenes).then((cache) => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderCompositorFrame(
        ctx,
        project,
        activeTimed.startSec + 1.2,
        w,
        h,
        cache
      );
    });

    return () => {
      cancelled = true;
    };
  }, [project, activeTimed]);

  const handleApplyHook = (hook: HookVariant) => {
    const firstScene = project.scenes[0];
    if (!firstScene) return;
    onUpdateScene(firstScene.id, {
      narration: hook.narration,
      visualDirection: hook.visualCue,
      motionGraphic: {
        ...firstScene.motionGraphic,
        type: 'kinetic-title',
        headline: hook.headline,
        subline: hook.hookType,
      },
    });
    onSelectScene(firstScene.id);
  };

  const handleToggleAudio = (url: string) => {
    if (playingAudioUrl === url && audioRef.current) {
      audioRef.current.pause();
      setPlayingAudioUrl(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudioUrl(null);
    audio.play().catch(() => setPlayingAudioUrl(null));
    setPlayingAudioUrl(url);
  };

  const handleAddBlankScene = () => {
    const defaultBroll =
      assets.find((a) => a.category === 'broll') || assets[0];
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      title: `Adegan ${String(project.scenes.length + 1).padStart(2, '0')}`,
      role: 'Isi / Penjelasan',
      durationSec: 6,
      narration: 'Tulis narasi lanjutan yang padat dan memikat audiens di sini.',
      visualDirection: 'B-roll studio editorial dengan pencahayaan alami.',
      brollKeywords: ['studio', 'editorial'],
      brollAssetId: defaultBroll?.id || null,
      brollUrl:
        defaultBroll?.url ||
        '/src/assets/images/broll_creator_studio_1794867128517.jpg',
      motionGraphic: {
        type: 'lower-third',
        headline: 'Poin Utama',
        subline: 'Keterangan pendukung',
        accentColor: '#2563EB',
      },
      transition: 'crossfade',
      kenBurns: 'zoom-in',
    };
    onCreateScene(newScene);
    onSelectScene(newScene.id);
  };

  const moveScene = (index: number, dir: -1 | 1) => {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= project.scenes.length) return;
    const ids = project.scenes.map((s) => s.id);
    const [item] = ids.splice(index, 1);
    ids.splice(nextIdx, 0, item);
    onReorderScenes(ids);
  };

  const visualAssets = assets.filter(
    (a) => a.category === 'broll' || a.category === 'upload'
  );

  const handleReadScriptFile = async (file: File) => {
    setDocUploadError(null);
    const lowerName = file.name.toLowerCase();
    if (
      !lowerName.endsWith('.txt') &&
      !lowerName.endsWith('.md') &&
      !lowerName.endsWith('.markdown') &&
      !file.type.startsWith('text/')
    ) {
      setDocUploadError('Format harus .txt atau .md.');
      return;
    }
    try {
      const content = await file.text();
      if (!content.trim()) {
        setDocUploadError('Isi file naskah kosong.');
        return;
      }
      setRawScriptDoc(content);
      setDocFileName(file.name);
    } catch {
      setDocUploadError('Gagal membaca berkas.');
    }
  };

  const activeComments = project.comments.filter((c) =>
    activeScene ? c.sceneId === activeScene.id : true
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* LEFT PANEL: Compact AI Script Generator */}
      <aside className="lg:col-span-3 bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            className="font-display text-[13px] font-semibold text-[#0F172A]"
            title="Susun naskah lengkap atau uraikan dokumen .txt/.md menjadi adegan siap produksi"
          >
            Generator Naskah AI
          </h2>
          <div
            role="tablist"
            aria-label="Sumber penyusunan naskah"
            className="inline-flex p-0.5 rounded-md bg-[#F1F5F9] border border-[#E2E8F0]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={generatorMode === 'topic'}
              onClick={() => setGeneratorMode('topic')}
              className={`px-2 py-1 text-[11px] font-medium rounded ${
                generatorMode === 'topic'
                  ? 'bg-white text-[#0F172A]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Topik
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={generatorMode === 'document'}
              onClick={() => setGeneratorMode('document')}
              className={`px-2 py-1 text-[11px] font-medium rounded ${
                generatorMode === 'document'
                  ? 'bg-white text-[#0F172A]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              .TXT / .MD
            </button>
          </div>
        </div>

        {generatorMode === 'topic' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onGenerateScriptAI({
                topic,
                languageStyle,
                aspectRatio,
                targetDurationSec,
                audience,
                ctaGoal,
              });
            }}
            className="space-y-2.5"
          >
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Topik & Ide Utama
              </label>
              <textarea
                rows={3}
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topik video, sudut pembahasan, atau poin utama..."
                className="w-full px-2.5 py-2 text-[13px] leading-snug bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#2563EB] outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Gaya Bahasa
              </label>
              <select
                value={languageStyle}
                onChange={(e) => setLanguageStyle(e.target.value)}
                className={inputClass}
              >
                {LANGUAGE_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Rasio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    const val = e.target.value as AspectRatio;
                    setAspectRatio(val);
                    onUpdateProject({ aspectRatio: val });
                  }}
                  className={inputClass}
                >
                  <option value="16:9">16:9 YouTube</option>
                  <option value="9:16">9:16 Reels/TikTok</option>
                  <option value="4:5">4:5 Feed IG</option>
                  <option value="1:1">1:1 Persegi</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Durasi Target
                </label>
                <select
                  value={targetDurationSec}
                  onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                  className={`${inputClass} font-mono tabular-nums`}
                >
                  <option value={25}>25 detik</option>
                  <option value={45}>45 detik</option>
                  <option value={60}>60 detik</option>
                  <option value={90}>90 detik</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              <input
                type="text"
                aria-label="Target audiens"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Target audiens (mis. kreator, UMKM)"
                className={inputClass}
              />
              <input
                type="text"
                aria-label="Ajakan penutup CTA"
                value={ctaGoal}
                onChange={(e) => setCtaGoal(e.target.value)}
                placeholder="Ajakan penutup / CTA"
                className={inputClass}
              />
            </div>

            {aiError && (
              <div className="p-2 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[11px] text-[#B91C1C]">
                {aiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isGeneratingScript || !topic.trim()}
              className="w-full h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] rounded-md"
            >
              {isGeneratingScript ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyusun Naskah...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Buat Naskah Otomatis</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onGenerateFromDocumentAI({
                rawScript: rawScriptDoc,
                fileName: docFileName || undefined,
                languageStyle,
                aspectRatio,
                preserveOriginalText,
              });
            }}
            className="space-y-2.5"
          >
            <input
              ref={docFileInputRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleReadScriptFile(file);
                e.target.value = '';
              }}
            />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleReadScriptFile(file);
              }}
              onClick={() => docFileInputRef.current?.click()}
              title="Unggah file .txt atau .md yang sudah memuat materi dan durasi/timestamp"
              className="px-3 py-2 rounded-md border border-dashed border-[#CBD5E1] hover:border-[#2563EB] bg-[#F8FAFC] cursor-pointer flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Upload className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                <span className="text-xs font-medium text-[#0F172A] truncate">
                  {docFileName || 'Pilih / Tarik File .TXT / .MD'}
                </span>
              </div>
              {rawScriptDoc.trim() && (
                <span className="text-[11px] font-mono text-[#64748B] tabular-nums shrink-0">
                  {rawScriptDoc.trim().split(/\s+/).length} kata
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-[#475569]">
                  Materi & Waktu Naskah
                </label>
                {rawScriptDoc && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawScriptDoc('');
                      setDocFileName('');
                      setDocUploadError(null);
                    }}
                    className="text-[11px] text-[#64748B] hover:text-[#DC2626]"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                required
                value={rawScriptDoc}
                onChange={(e) => setRawScriptDoc(e.target.value)}
                placeholder={`[00:00 - 00:07] Pembuka\nTeks materi...\n\n## Poin Inti (12 detik)\nTeks materi...`}
                className="w-full px-2.5 py-2 text-xs font-mono leading-snug bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#2563EB] outline-none resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setPreserveOriginalText(true)}
                title="Pertahankan kalimat & durasi persis seperti di dokumen"
                className={`h-8 px-2 text-[11px] font-medium rounded-md border ${
                  preserveOriginalText
                    ? 'bg-[#EFF6FF] border-[#2563EB] text-[#0F172A]'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                }`}
              >
                Teks Asli
              </button>
              <button
                type="button"
                onClick={() => setPreserveOriginalText(false)}
                title="Haluskan kalimat materi agar nyaman dibacakan voiceover"
                className={`h-8 px-2 text-[11px] font-medium rounded-md border ${
                  !preserveOriginalText
                    ? 'bg-[#EFF6FF] border-[#2563EB] text-[#0F172A]'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                }`}
              >
                Adaptasi Gaya
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Gaya bahasa"
                value={languageStyle}
                onChange={(e) => setLanguageStyle(e.target.value)}
                className={inputClass}
              >
                {LANGUAGE_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>

              <select
                aria-label="Rasio format"
                value={aspectRatio}
                onChange={(e) => {
                  const val = e.target.value as AspectRatio;
                  setAspectRatio(val);
                  onUpdateProject({ aspectRatio: val });
                }}
                className={inputClass}
              >
                <option value="16:9">16:9 YouTube</option>
                <option value="9:16">9:16 Reels/TikTok</option>
                <option value="4:5">4:5 Feed IG</option>
                <option value="1:1">1:1 Persegi</option>
              </select>
            </div>

            {(docUploadError || aiError) && (
              <div className="p-2 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[11px] text-[#B91C1C]">
                {docUploadError || aiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isGeneratingScript || !rawScriptDoc.trim()}
              className="w-full h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] rounded-md"
            >
              {isGeneratingScript ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengurai Materi...</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  <span>Generate dari Naskah</span>
                </>
              )}
            </button>
          </form>
        )}
      </aside>

      {/* CENTER PANEL: Compact Hook Lab + Dense Scene Table/Rows */}
      <section className="lg:col-span-6 space-y-4">
        {/* Hook Lab */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2
              className="font-display text-[13px] font-semibold text-[#0F172A]"
              title="Pilih variasi pembuka 3 detik pertama yang paling kuat untuk adegan pertama"
            >
              Hook 3-Detik
            </h2>
            <button
              type="button"
              onClick={onGenerateHooksAI}
              disabled={isGeneratingHooks}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md whitespace-nowrap"
            >
              {isGeneratingHooks ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>Variasi Baru</span>
            </button>
          </div>

          {project.hooks.length === 0 ? (
            <div className="py-3 text-center text-xs text-[#64748B] border border-dashed border-[#CBD5E1] rounded-md">
              Belum ada variasi hook. Klik Variasi Baru untuk membuat 3 opsi pembuka.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {project.hooks.map((hook) => (
                <div
                  key={hook.id}
                  title={hook.retentionAngle}
                  className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-[#2563EB] truncate">
                      {hook.hookType} · {hook.headline}
                    </div>
                    <p className="text-xs text-[#0F172A] leading-snug line-clamp-3">
                      “{hook.narration}”
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyHook(hook)}
                    className="w-full h-7 text-[11px] font-medium text-[#0F172A] bg-white hover:bg-[#EFF6FF] hover:text-[#2563EB] border border-[#E2E8F0] rounded"
                  >
                    Pakai di Adegan 01
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scene List Action Bar */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-[13px] font-semibold text-[#0F172A]">
              Daftar Adegan Naskah ({timed.length})
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={project.scenes.length === 0}
                onClick={() => {
                  if (!selectedSceneId && project.scenes[0]) {
                    onSelectScene(project.scenes[0].id);
                  }
                  setIsTeleprompterOpen(true);
                }}
                className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded-md whitespace-nowrap disabled:opacity-40"
              >
                <ScrollText className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Teleprompter</span>
              </button>
              <button
                type="button"
                onClick={handleAddBlankScene}
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded-md whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Adegan</span>
              </button>
            </div>
          </div>

          {timed.map((item) => {
            const sc = item.scene;
            const isSelected = activeScene?.id === sc.id;
            const wordCount = sc.narration.trim().split(/\s+/).filter(Boolean).length;
            const teammatesHere = presence.filter(
              (p) => p.clientId !== currentClientId && p.activeSceneId === sc.id
            );

            return (
              <article
                key={sc.id}
                onClick={() => onSelectScene(sc.id)}
                className={`bg-white rounded-lg border p-3 space-y-2.5 cursor-pointer ${
                  isSelected
                    ? 'border-[#2563EB]'
                    : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                {/* Compact Header Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#F1F5F9]">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#64748B]">
                    <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                      {String(item.index + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={sc.title}
                      onChange={(e) =>
                        onUpdateScene(sc.id, { title: e.target.value })
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold text-[#0F172A] bg-transparent border-b border-transparent hover:border-[#CBD5E1] focus:border-[#2563EB] outline-none w-36"
                    />
                    <span aria-hidden="true">·</span>
                    <span>{sc.role}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTimecode(item.startSec)}–{formatTimecode(item.endSec)} ({sc.durationSec}d)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{wordCount} kata</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {teammatesHere.map((tm) => (
                      <span
                        key={tm.clientId}
                        className="text-[11px] font-medium mr-1"
                        style={{ color: tm.color }}
                      >
                        {tm.name}
                      </span>
                    ))}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectScene(sc.id);
                        setIsTeleprompterOpen(true);
                      }}
                      title="Buka Teleprompter untuk adegan ini"
                      className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#475569] hover:text-[#2563EB] rounded hover:bg-[#EFF6FF]"
                    >
                      <ScrollText className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveScene(item.index, -1);
                      }}
                      disabled={item.index === 0}
                      title="Naikkan urutan"
                      aria-label="Naikkan urutan adegan"
                      className="h-7 w-7 inline-flex items-center justify-center text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 rounded hover:bg-[#F1F5F9]"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveScene(item.index, 1);
                      }}
                      disabled={item.index === timed.length - 1}
                      title="Turunkan urutan"
                      aria-label="Turunkan urutan adegan"
                      className="h-7 w-7 inline-flex items-center justify-center text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 rounded hover:bg-[#F1F5F9]"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    {timed.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScene(sc.id);
                        }}
                        title="Hapus adegan"
                        aria-label="Hapus adegan"
                        className="h-7 w-7 inline-flex items-center justify-center text-[#64748B] hover:text-[#DC2626] rounded hover:bg-[#FEF2F2]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dense 2-Column Body */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-7 space-y-2">
                    <textarea
                      rows={3}
                      aria-label={`Narasi ${sc.title}`}
                      value={sc.narration}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateScene(sc.id, { narration: e.target.value })
                      }
                      placeholder="Tulis naskah narasi voiceover..."
                      className="w-full px-2.5 py-1.5 text-[13px] text-[#0F172A] leading-snug bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:bg-white focus:border-[#2563EB] outline-none resize-none"
                    />

                    {/* Grouped AI Polish + TTS Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {['Pertajam kalimat', 'Persingkat 20%', 'Lebih persuasif'].map(
                          (instr) => (
                            <button
                              key={instr}
                              type="button"
                              disabled={polishingSceneId === sc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onPolishSceneAI(sc.id, instr);
                              }}
                              className="h-7 px-2 text-[11px] font-medium text-[#475569] hover:text-[#2563EB] bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] rounded"
                            >
                              {polishingSceneId === sc.id ? '...' : instr.replace(' kalimat', '')}
                            </button>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {sc.ttsAudioUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAudio(sc.ttsAudioUrl!);
                            }}
                            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>{playingAudioUrl === sc.ttsAudioUrl ? 'Jeda' : 'Putar'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={generatingTtsSceneId === sc.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onGenerateSceneTts(sc.id);
                          }}
                          className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded"
                        >
                          {generatingTtsSceneId === sc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#2563EB]" />
                          ) : (
                            <Volume2 className="w-3 h-3 text-[#2563EB]" />
                          )}
                          <span>{sc.ttsAudioUrl ? 'Ulang TTS' : 'Buat TTS'}</span>
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      aria-label="Arahan visual"
                      value={sc.visualDirection}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateScene(sc.id, { visualDirection: e.target.value })
                      }
                      placeholder="Arahan visual & B-roll..."
                      className={inputClass}
                    />
                  </div>

                  {/* Right Subcolumn: Compact B-Roll + 2x2 Visual/Motion Grid */}
                  <div className="md:col-span-5 space-y-2">
                    <div className="relative h-24 rounded-md overflow-hidden bg-[#F1F5F9] border border-[#E2E8F0]">
                      <img
                        src={sc.brollUrl}
                        alt={sc.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-[#0F172A]/70 flex items-center justify-between px-2 py-1">
                        <span className="text-[11px] font-medium text-white truncate max-w-[110px]">
                          {sc.brollKeywords.slice(0, 2).join(' · ') || 'B-Roll'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBrollPickerSceneId(
                              brollPickerSceneId === sc.id ? null : sc.id
                            );
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-semibold bg-white text-[#0F172A] rounded hover:bg-[#EFF6FF]"
                        >
                          Ganti
                        </button>
                      </div>
                    </div>

                    {brollPickerSceneId === sc.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md"
                      >
                        <div className="grid grid-cols-3 gap-1 max-h-28 overflow-y-auto">
                          {visualAssets.map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => {
                                onUpdateScene(sc.id, {
                                  brollAssetId: asset.id,
                                  brollUrl: asset.url,
                                });
                                setBrollPickerSceneId(null);
                              }}
                              className={`aspect-video rounded overflow-hidden border ${
                                sc.brollAssetId === asset.id
                                  ? 'border-[#2563EB] ring-1 ring-[#2563EB]'
                                  : 'border-[#E2E8F0]'
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
                    )}

                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        aria-label="Motion graphic"
                        value={sc.motionGraphic.type}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateScene(sc.id, {
                            motionGraphic: {
                              ...sc.motionGraphic,
                              type: e.target.value as MotionGraphicType,
                            },
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11px] bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[#0F172A] outline-none focus:border-[#2563EB]"
                      >
                        {MOTION_GRAPHIC_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="Transisi masuk"
                        value={sc.transition}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateScene(sc.id, {
                            transition: e.target.value as TransitionType,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11px] bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[#0F172A] outline-none focus:border-[#2563EB]"
                      >
                        {TRANSITION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        aria-label="Judul grafis"
                        value={sc.motionGraphic.headline}
                        placeholder="Judul grafis"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateScene(sc.id, {
                            motionGraphic: {
                              ...sc.motionGraphic,
                              headline: e.target.value,
                            },
                          })
                        }
                        className="w-full h-7 px-2 text-[11px] bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[#0F172A] outline-none focus:border-[#2563EB]"
                      />

                      <select
                        aria-label="Gerakan kamera"
                        value={sc.kenBurns}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateScene(sc.id, {
                            kenBurns: e.target.value as KenBurnsDirection,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11px] bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[#0F172A] outline-none focus:border-[#2563EB]"
                      >
                        {KEN_BURNS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* RIGHT RAIL: Compact Preview & Team Comments */}
      <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-16">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <h3 className="font-display text-[13px] font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Pratinjau Frame</span>
            </h3>
            <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
              {project.aspectRatio}
              {activeScene ? ` · ${activeScene.durationSec}d` : ''}
            </span>
          </div>

          <div className="bg-[#F1F5F9] rounded-md overflow-hidden border border-[#E2E8F0] flex items-center justify-center p-1.5">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-[210px] w-auto h-auto rounded"
            />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[13px] font-semibold text-[#0F172A] flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Catatan Tim</span>
            </h3>
            <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
              {activeComments.length}
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
            {activeComments.length === 0 ? (
              <p className="text-xs text-[#64748B] py-3 text-center">
                Belum ada catatan untuk adegan ini.
              </p>
            ) : (
              activeComments.map((c) => (
                <div
                  key={c.id}
                  className={`p-2.5 rounded-md border text-xs space-y-1 ${
                    c.resolved
                      ? 'bg-[#F8FAFC] border-[#E2E8F0] opacity-60'
                      : 'bg-white border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: c.authorColor }}
                    >
                      {c.authorName}
                    </span>
                    <button
                      type="button"
                      onClick={() => onResolveComment(c.id, !c.resolved)}
                      className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#16A34A]"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{c.resolved ? 'Selesai' : 'Tandai'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#334155] leading-snug">{c.text}</p>
                </div>
              ))
            )}
          </div>

          {activeScene && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentInput.trim()) return;
                onAddComment(activeScene.id, commentInput.trim());
                setCommentInput('');
              }}
              className="flex items-center gap-1.5 pt-2 border-t border-[#F1F5F9]"
            >
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={`Catatan untuk ${activeScene.title}...`}
                className="flex-1 h-8 px-2.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] focus:bg-white focus:border-[#2563EB] outline-none"
              />
              <button
                type="submit"
                aria-label="Kirim catatan"
                className="h-8 w-8 inline-flex items-center justify-center bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-md shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </aside>

      <TeleprompterOverlay
        isOpen={isTeleprompterOpen}
        onClose={() => setIsTeleprompterOpen(false)}
        scenes={project.scenes}
        activeSceneId={activeScene?.id || ''}
        onSelectScene={onSelectScene}
      />
    </div>
  );
};
