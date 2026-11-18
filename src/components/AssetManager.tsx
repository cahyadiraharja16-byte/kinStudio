import React, { useRef, useState } from 'react';
import {
  Check,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Pause,
  Play,
  Search,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { AssetCategory, CentralAsset, Scene, StorageStats } from '../types/studio';

interface AssetManagerProps {
  assets: CentralAsset[];
  stats: StorageStats;
  scenes: Scene[];
  selectedSceneId: string;
  onAssignBrollToScene: (sceneId: string, asset: CentralAsset) => void;
  onUploadAsset: (file: File) => Promise<{ deduplicated: boolean; asset: CentralAsset }>;
  onDeleteAsset: (assetId: string) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AssetManager: React.FC<AssetManagerProps> = ({
  assets,
  stats,
  scenes,
  selectedSceneId,
  onAssignBrollToScene,
  onUploadAsset,
  onDeleteAsset,
}) => {
  const [filter, setFilter] = useState<'all' | AssetCategory>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [assignedAssetId, setAssignedAssetId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0];

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadNotice(null);
    try {
      const result = await onUploadAsset(files[0]);
      if (result.deduplicated) {
        setUploadNotice(
          `Berkas identik (SHA-256) — memakai kembali "${result.asset.name}".`
        );
      } else {
        setUploadNotice(`Aset "${result.asset.name}" tersimpan di pustaka.`);
      }
    } catch (err) {
      setUploadNotice(err instanceof Error ? err.message : 'Gagal mengunggah berkas.');
    } finally {
      setUploading(false);
    }
  };

  const toggleAudio = (asset: CentralAsset) => {
    if (playingAudioId === asset.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(asset.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
    setPlayingAudioId(asset.id);
  };

  const filteredAssets = assets.filter((a) => {
    if (filter !== 'all' && a.category !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-4 space-y-4">
      {/* Compact Storage Header */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <h2
          className="font-display text-sm font-semibold text-[#0F172A] flex items-center gap-1.5"
          title="Pustaka media lintas proyek dengan deduplikasi SHA-256 otomatis"
        >
          <HardDrive className="w-4 h-4 text-[#2563EB]" />
          <span>Pustaka Aset Terpusat</span>
        </h2>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#64748B]">Total:</span>
            <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
              {stats.totalAssets} berkas
            </span>
          </div>
          <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#64748B]">Terpakai:</span>
            <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
              {formatBytes(stats.totalBytes)}
            </span>
          </div>
          <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#64748B]">Hemat SHA-256:</span>
            <span className="font-mono font-semibold text-[#16A34A] tabular-nums">
              {formatBytes(stats.dedupSavedBytes)} ({stats.dedupHits}x)
            </span>
          </div>
        </div>
      </section>

      {/* Compact Toolbar */}
      <section className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="inline-flex items-center gap-0.5 p-0.5 bg-white border border-[#E2E8F0] rounded-md overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'broll', label: 'B-Roll' },
              { id: 'upload', label: 'Unggahan' },
              { id: 'audio-tts', label: 'Audio TTS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`h-7 px-2.5 text-xs font-medium rounded whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau tag..."
              className="w-full h-8 pl-8 pr-2.5 text-xs bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] focus:border-[#2563EB] outline-none"
            />
          </div>

          <div className="inline-flex p-0.5 bg-white border border-[#E2E8F0] rounded-md">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Tampilan Grid"
              aria-label="Tampilan Grid"
              className={`h-7 w-7 inline-flex items-center justify-center rounded ${
                viewMode === 'grid'
                  ? 'bg-[#F1F5F9] text-[#0F172A]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Tampilan Tabel Padat"
              aria-label="Tampilan Tabel"
              className={`h-7 w-7 inline-flex items-center justify-center rounded ${
                viewMode === 'table'
                  ? 'bg-[#F1F5F9] text-[#0F172A]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Mengunggah...' : 'Unggah'}</span>
          </button>
        </div>
      </section>

      {uploadNotice && (
        <div className="px-3 py-2 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#1E40AF]">
          {uploadNotice}
        </div>
      )}

      {filteredAssets.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center space-y-1.5">
          <Layers className="w-6 h-6 text-[#94A3B8] mx-auto" />
          <div className="text-[13px] font-medium text-[#0F172A]">
            Tidak ada aset yang cocok
          </div>
          <p className="text-xs text-[#64748B]">
            Ubah filter atau unggah media baru.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredAssets.map((asset) => {
            const isImage = asset.mimeType.startsWith('image/');
            const usageCount = scenes.filter(
              (s) => s.brollAssetId === asset.id || s.ttsAudioUrl === asset.url
            ).length;

            return (
              <article
                key={asset.id}
                className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {isImage ? (
                    <div className="aspect-video bg-[#F1F5F9] overflow-hidden">
                      <img
                        src={asset.url}
                        alt={asset.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-[#F8FAFC] border-b border-[#F1F5F9] flex flex-col items-center justify-center gap-1.5 p-2">
                      <Volume2 className="w-5 h-5 text-[#2563EB]" />
                      <button
                        type="button"
                        onClick={() => toggleAudio(asset)}
                        className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded"
                      >
                        {playingAudioId === asset.id ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        <span>{playingAudioId === asset.id ? 'Jeda' : 'Putar'}</span>
                      </button>
                    </div>
                  )}

                  <div className="p-2.5 space-y-1">
                    <h3
                      className="text-xs font-semibold text-[#0F172A] truncate"
                      title={asset.name}
                    >
                      {asset.name}
                    </h3>
                    <div className="text-[11px] text-[#64748B] font-mono tabular-nums truncate">
                      {formatBytes(asset.sizeBytes)}
                      {asset.resolution ? ` · ${asset.resolution}` : ''}
                      {asset.durationSec ? ` · ${asset.durationSec}d` : ''}
                      {` · ${usageCount}x`}
                    </div>
                  </div>
                </div>

                <div className="px-2.5 pb-2.5 flex items-center justify-between gap-1.5">
                  {isImage && activeScene ? (
                    <button
                      type="button"
                      onClick={() => {
                        onAssignBrollToScene(activeScene.id, asset);
                        setAssignedAssetId(asset.id);
                        setTimeout(() => setAssignedAssetId(null), 1600);
                      }}
                      className="flex-1 h-7 px-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:text-[#2563EB] border border-[#E2E8F0] rounded truncate"
                    >
                      {assignedAssetId === asset.id ? (
                        <>
                          <Check className="w-3 h-3 text-[#16A34A]" />
                          <span className="text-[#16A34A]">Terpasang</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{activeScene.title}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-[#94A3B8]">
                      SHA {asset.sha256.slice(0, 8)}
                    </span>
                  )}

                  {!asset.isSystem && (
                    <button
                      type="button"
                      onClick={() => onDeleteAsset(asset.id)}
                      aria-label="Hapus aset"
                      className="h-7 w-7 inline-flex items-center justify-center text-[#64748B] hover:text-[#DC2626] rounded hover:bg-[#FEF2F2] shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-medium text-[#475569]">
                <th className="py-2 px-3 w-20">Pratinjau</th>
                <th className="py-2 px-2">Nama & Tag</th>
                <th className="py-2 px-2 w-28">Ukuran</th>
                <th className="py-2 px-2 w-28">Spesifikasi</th>
                <th className="py-2 px-2 w-20">Pakai</th>
                <th className="py-2 px-3 w-44 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {filteredAssets.map((asset) => {
                const isImage = asset.mimeType.startsWith('image/');
                const usageCount = scenes.filter(
                  (s) => s.brollAssetId === asset.id || s.ttsAudioUrl === asset.url
                ).length;

                return (
                  <tr key={asset.id} className="hover:bg-[#F8FAFC]/60">
                    <td className="py-2 px-3">
                      {isImage ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          referrerPolicy="no-referrer"
                          className="w-16 aspect-video rounded object-cover border border-[#E2E8F0]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleAudio(asset)}
                          className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded"
                        >
                          {playingAudioId === asset.id ? (
                            <Pause className="w-3 h-3 text-[#2563EB]" />
                          ) : (
                            <Play className="w-3 h-3 text-[#2563EB]" />
                          )}
                          <span>Audio</span>
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <div className="font-semibold text-[#0F172A]">{asset.name}</div>
                      <div className="text-[11px] text-[#64748B] truncate max-w-xs">
                        {asset.tags.join(' · ')}
                      </div>
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] text-[#475569] tabular-nums whitespace-nowrap">
                      {formatBytes(asset.sizeBytes)}
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] text-[#475569] tabular-nums whitespace-nowrap">
                      {asset.resolution || (asset.durationSec ? `${asset.durationSec}d` : '—')}
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] text-[#475569] tabular-nums">
                      {usageCount}x
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isImage && activeScene && (
                          <button
                            type="button"
                            onClick={() => {
                              onAssignBrollToScene(activeScene.id, asset);
                              setAssignedAssetId(asset.id);
                              setTimeout(() => setAssignedAssetId(null), 1600);
                            }}
                            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:text-[#2563EB] border border-[#E2E8F0] rounded"
                          >
                            {assignedAssetId === asset.id ? (
                              <Check className="w-3 h-3 text-[#16A34A]" />
                            ) : (
                              <ImageIcon className="w-3 h-3" />
                            )}
                            <span>{assignedAssetId === asset.id ? 'Terpasang' : 'Pasang'}</span>
                          </button>
                        )}
                        {!asset.isSystem && (
                          <button
                            type="button"
                            onClick={() => onDeleteAsset(asset.id)}
                            aria-label="Hapus aset"
                            className="h-7 w-7 inline-flex items-center justify-center text-[#64748B] hover:text-[#DC2626] rounded hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
