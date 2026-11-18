import { useCallback, useEffect, useState } from 'react';
import { AssetManager } from './components/AssetManager';
import { AudioStudio } from './components/AudioStudio';
import { ExportModal } from './components/ExportModal';
import { ScriptStudio } from './components/ScriptStudio';
import { TopBar } from './components/TopBar';
import { VisualStudio } from './components/VisualStudio';
import { WorkspaceBar } from './components/WorkspaceBar';
import { useCollaboration } from './hooks/useCollaboration';
import type {
  AspectRatio,
  CentralAsset,
  Project,
  Scene,
  SceneComment,
  StorageStats,
  StudioTab,
} from './types/studio';

function getInitialUserName(): string {
  try {
    const saved = localStorage.getItem('kinescript_user_name');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore storage errors
  }
  const suffix = Math.floor(10 + Math.random() * 89);
  return `Editor ${suffix}`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '';
  });
  const [assets, setAssets] = useState<CentralAsset[]>([]);
  const [stats, setStats] = useState<StorageStats>({
    totalAssets: 0,
    totalBytes: 0,
    dedupSavedBytes: 0,
    dedupHits: 0,
  });
  const [activeTab, setActiveTab] = useState<StudioTab>('script');
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [userName, setUserName] = useState<string>(getInitialUserName);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [polishingSceneId, setPolishingSceneId] = useState<string | null>(null);
  const [generatingTtsSceneId, setGeneratingTtsSceneId] = useState<string | null>(
    null
  );
  const [isBatchGeneratingTts, setIsBatchGeneratingTts] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);

  // Load initial studio projects & centralized assets
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        const list: Project[] = data.projects || [];
        setProjects(list);
        setAssets(data.assets || []);
        if (data.stats) setStats(data.stats);

        const params = new URLSearchParams(window.location.search);
        const requestedRoom = params.get('room');
        const chosen =
          list.find((p) => p.id === requestedRoom) || list[0] || null;
        if (chosen) {
          setActiveProjectId(chosen.id);
          setSelectedSceneId(chosen.scenes[0]?.id || '');
        }
      })
      .catch((err) => {
        console.error('Failed to load studio state:', err);
      })
      .finally(() => {
        setIsLoadingInitial(false);
      });
  }, []);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || null;

  const updateLocalProject = useCallback(
    (projectId: string, updater: (prev: Project) => Project) => {
      setProjects((prevList) =>
        prevList.map((p) => (p.id === projectId ? updater(p) : p))
      );
    },
    []
  );

  // Real-Time WebSocket Collaboration Hook
  const { status, clientId, presence, sendMessage, updatePresence } =
    useCollaboration({
      roomId: activeProject?.id || '',
      userName,
      onRemoteProjectSync: (syncedProject) => {
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === syncedProject.id);
          if (!exists) return [syncedProject, ...prev];
          return prev.map((p) =>
            p.id === syncedProject.id ? syncedProject : p
          );
        });
      },
      onRemoteProjectPatch: (patch) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => ({ ...p, ...patch }));
      },
      onRemoteSceneUpdate: (sceneId, patch) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => ({
          ...p,
          scenes: p.scenes.map((s) =>
            s.id === sceneId ? { ...s, ...patch } : s
          ),
        }));
      },
      onRemoteSceneCreate: (scene) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => {
          if (p.scenes.some((s) => s.id === scene.id)) return p;
          return { ...p, scenes: [...p.scenes, scene] };
        });
      },
      onRemoteSceneDelete: (sceneId) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => ({
          ...p,
          scenes: p.scenes.filter((s) => s.id !== sceneId),
        }));
      },
      onRemoteSceneReorder: (sceneIds) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => {
          const map = new Map(p.scenes.map((s) => [s.id, s]));
          const reordered = sceneIds
            .map((id) => map.get(id))
            .filter((s): s is Scene => Boolean(s));
          return reordered.length === p.scenes.length
            ? { ...p, scenes: reordered }
            : p;
        });
      },
      onRemoteCommentCreate: (comment) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => {
          if (p.comments.some((c) => c.id === comment.id)) return p;
          return { ...p, comments: [...p.comments, comment] };
        });
      },
      onRemoteCommentResolve: (commentId, resolved) => {
        if (!activeProject) return;
        updateLocalProject(activeProject.id, (p) => ({
          ...p,
          comments: p.comments.map((c) =>
            c.id === commentId ? { ...c, resolved } : c
          ),
        }));
      },
      onRemoteAssetAdded: (asset, newStats) => {
        setAssets((prev) =>
          prev.some((a) => a.id === asset.id) ? prev : [asset, ...prev]
        );
        if (newStats) setStats(newStats);
      },
      onRemoteAssetDeleted: (assetId, newStats) => {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        if (newStats) setStats(newStats);
      },
    });

  // Sync user's active scene/tab focus to collaborators
  useEffect(() => {
    if (status === 'connected') {
      updatePresence({
        activeSceneId: selectedSceneId || null,
        activeTab,
      });
    }
  }, [status, selectedSceneId, activeTab, updatePresence]);

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    const found = projects.find((p) => p.id === projectId);
    setSelectedSceneId(found?.scenes[0]?.id || '');
    const url = new URL(window.location.href);
    url.searchParams.set('room', projectId);
    window.history.replaceState({}, '', url.toString());
  };

  const handleCreateBlankProject = async () => {
    const defaultBroll = assets.find((a) => a.category === 'broll') || assets[0];
    const newId = `proj-${Date.now()}`;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newId,
        title: `Proyek Baru ${projects.length + 1}`,
        topic: 'Topik video kreatif terbaru',
        scenes: [
          {
            id: `scene-${Date.now()}-1`,
            title: 'Hook Pembuka',
            role: 'Hook',
            durationSec: 5,
            narration: 'Mulai dengan pernyataan pembuka yang memicu rasa ingin tahu dalam tiga detik.',
            visualDirection: 'B-roll studio terang dengan komposisi bersih.',
            brollKeywords: ['studio', 'pembuka'],
            brollAssetId: defaultBroll?.id || null,
            brollUrl:
              defaultBroll?.url ||
              '/src/assets/images/broll_creator_studio_1794867128517.jpg',
            motionGraphic: {
              type: 'kinetic-title',
              headline: 'Judul Hook Pembuka',
              subline: 'Subjudul singkat',
              accentColor: '#2563EB',
            },
            transition: 'crossfade',
            kenBurns: 'zoom-in',
          },
        ],
      }),
    });
    const data = await res.json();
    if (data.project) {
      setProjects((prev) => [data.project, ...prev]);
      handleSelectProject(data.project.id);
      setActiveTab('script');
    }
  };

  const handleChangeUserName = (name: string) => {
    setUserName(name);
    try {
      localStorage.setItem('kinescript_user_name', name);
    } catch {
      // ignore
    }
    updatePresence({ name });
  };

  const handleUpdateProject = (patch: Partial<Project>) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => ({ ...p, ...patch }));
    sendMessage({ type: 'project:patch', patch });
  };

  const handleUpdateScene = (sceneId: string, patch: Partial<Scene>) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => ({
      ...p,
      scenes: p.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
    }));
    sendMessage({ type: 'scene:update', sceneId, patch });
  };

  const handleCreateScene = (scene: Scene) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => ({
      ...p,
      scenes: [...p.scenes, scene],
    }));
    sendMessage({ type: 'scene:create', scene });
  };

  const handleDeleteScene = (sceneId: string) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => ({
      ...p,
      scenes: p.scenes.filter((s) => s.id !== sceneId),
    }));
    sendMessage({ type: 'scene:delete', sceneId });
  };

  const handleReorderScenes = (sceneIds: string[]) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => {
      const map = new Map(p.scenes.map((s) => [s.id, s]));
      const reordered = sceneIds
        .map((id) => map.get(id))
        .filter((s): s is Scene => Boolean(s));
      return { ...p, scenes: reordered };
    });
    sendMessage({ type: 'scene:reorder', sceneIds });
  };

  const handleAddComment = (sceneId: string, text: string) => {
    if (!activeProject) return;
    const me = presence.find((p) => p.clientId === clientId);
    const comment: SceneComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sceneId,
      authorName: userName,
      authorColor: me?.color || '#2563EB',
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    updateLocalProject(activeProject.id, (p) => ({
      ...p,
      comments: [...p.comments, comment],
    }));
    sendMessage({ type: 'comment:create', comment });
  };

  const handleResolveComment = (commentId: string, resolved: boolean) => {
    if (!activeProject) return;
    updateLocalProject(activeProject.id, (p) => ({
      ...p,
      comments: p.comments.map((c) =>
        c.id === commentId ? { ...c, resolved } : c
      ),
    }));
    sendMessage({ type: 'comment:resolve', commentId, resolved });
  };

  // --- AI Calls ---
  const handleGenerateScriptAI = async (params: {
    topic: string;
    languageStyle: string;
    aspectRatio: AspectRatio;
    targetDurationSec: number;
    audience: string;
    ctaGoal: string;
  }) => {
    if (!activeProject) return;
    setIsGeneratingScript(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          ...params,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat naskah AI.');
      }
      if (data.project) {
        updateLocalProject(activeProject.id, () => data.project);
        setSelectedSceneId(data.project.scenes[0]?.id || '');
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi AI.'
      );
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateFromDocumentAI = async (params: {
    rawScript: string;
    fileName?: string;
    languageStyle: string;
    aspectRatio: AspectRatio;
    preserveOriginalText: boolean;
  }) => {
    if (!activeProject) return;
    setIsGeneratingScript(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate-from-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          ...params,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengolah dokumen naskah.');
      }
      if (data.project) {
        updateLocalProject(activeProject.id, () => data.project);
        setSelectedSceneId(data.project.scenes[0]?.id || '');
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengolah dokumen.'
      );
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateHooksAI = async () => {
    if (!activeProject) return;
    setIsGeneratingHooks(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          topic: activeProject.topic || activeProject.title,
          languageStyle: activeProject.languageStyle,
          currentNarration: activeProject.scenes[0]?.narration || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat variasi hook.');
      updateLocalProject(activeProject.id, (p) => ({
        ...p,
        hooks: data.hooks || [],
      }));
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Gagal membuat variasi hook baru.'
      );
    } finally {
      setIsGeneratingHooks(false);
    }
  };

  const handlePolishSceneAI = async (sceneId: string, instruction: string) => {
    if (!activeProject) return;
    const sc = activeProject.scenes.find((s) => s.id === sceneId);
    if (!sc) return;

    setPolishingSceneId(sceneId);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/polish-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narration: sc.narration,
          instruction,
          languageStyle: activeProject.languageStyle,
          topic: activeProject.topic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyunting adegan.');
      handleUpdateScene(sceneId, {
        narration: data.narration,
        motionGraphic: {
          ...sc.motionGraphic,
          headline: data.headline || sc.motionGraphic.headline,
        },
      });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Gagal menyunting narasi adegan.'
      );
    } finally {
      setPolishingSceneId(null);
    }
  };

  const handleGenerateSceneTts = async (sceneId: string) => {
    if (!activeProject) return;
    const sc = activeProject.scenes.find((s) => s.id === sceneId);
    if (!sc) return;

    setGeneratingTtsSceneId(sceneId);
    setTtsError(null);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          sceneId: sc.id,
          sceneTitle: sc.title,
          text: sc.narration,
          voiceName: activeProject.voiceName,
          stylePrompt: activeProject.voiceStylePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat suara TTS.');

      updateLocalProject(activeProject.id, (p) => ({
        ...p,
        scenes: p.scenes.map((item) =>
          item.id === sc.id
            ? {
                ...item,
                ttsAudioUrl: data.audioUrl,
                ttsVoiceName: activeProject.voiceName,
                ttsDurationSec: data.durationSec,
                durationSec:
                  data.durationSec > item.durationSec
                    ? Math.ceil(data.durationSec)
                    : item.durationSec,
              }
            : item
        ),
      }));
      if (data.asset) {
        setAssets((prev) =>
          prev.some((a) => a.id === data.asset.id)
            ? prev
            : [data.asset, ...prev]
        );
      }
      if (data.stats) setStats(data.stats);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal merender suara TTS.';
      setTtsError(msg);
      setAiError(msg);
    } finally {
      setGeneratingTtsSceneId(null);
    }
  };

  const handleGenerateAllTts = async () => {
    if (!activeProject) return;
    setIsBatchGeneratingTts(true);
    setTtsError(null);
    try {
      for (const sc of activeProject.scenes) {
        await handleGenerateSceneTts(sc.id);
      }
    } finally {
      setIsBatchGeneratingTts(false);
    }
  };

  // --- Centralized Asset Handlers ---
  const handleUploadAsset = async (
    file: File
  ): Promise<{ deduplicated: boolean; asset: CentralAsset }> => {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name.replace(/\.[^/.]+$/, ''),
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
        tags: ['unggahan', file.type.startsWith('audio/') ? 'audio' : 'b-roll'],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengunggah aset.');
    if (data.asset) {
      setAssets((prev) =>
        prev.some((a) => a.id === data.asset.id) ? prev : [data.asset, ...prev]
      );
    }
    if (data.stats) setStats(data.stats);
    return { deduplicated: Boolean(data.deduplicated), asset: data.asset };
  };

  const handleDeleteAsset = async (assetId: string) => {
    const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      if (data.stats) setStats(data.stats);
    }
  };

  if (isLoadingInitial || !activeProject) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="font-display text-lg font-bold text-[#0F172A]">
            KineScript
          </div>
          <p className="text-xs text-[#64748B]">Memuat ruang kerja studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenExport={() => setIsExportOpen(true)}
      />

      <WorkspaceBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateBlankProject={handleCreateBlankProject}
        onUpdateTitle={(title) => handleUpdateProject({ title })}
        connectionStatus={status}
        presence={presence}
        currentClientId={clientId}
        userName={userName}
        onChangeUserName={handleChangeUserName}
      />

      <main className="flex-1 pb-6">
        {activeTab === 'script' && (
          <ScriptStudio
            project={activeProject}
            assets={assets}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
            presence={presence}
            currentClientId={clientId}
            userName={userName}
            onUpdateProject={handleUpdateProject}
            onUpdateScene={handleUpdateScene}
            onCreateScene={handleCreateScene}
            onDeleteScene={handleDeleteScene}
            onReorderScenes={handleReorderScenes}
            onAddComment={handleAddComment}
            onResolveComment={handleResolveComment}
            onGenerateScriptAI={handleGenerateScriptAI}
            onGenerateFromDocumentAI={handleGenerateFromDocumentAI}
            onGenerateHooksAI={handleGenerateHooksAI}
            onPolishSceneAI={handlePolishSceneAI}
            onGenerateSceneTts={handleGenerateSceneTts}
            isGeneratingScript={isGeneratingScript}
            isGeneratingHooks={isGeneratingHooks}
            polishingSceneId={polishingSceneId}
            generatingTtsSceneId={generatingTtsSceneId}
            aiError={aiError}
          />
        )}

        {activeTab === 'visual' && (
          <VisualStudio
            project={activeProject}
            assets={assets}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
            onUpdateScene={handleUpdateScene}
            onUpdateProject={handleUpdateProject}
          />
        )}

        {activeTab === 'audio' && (
          <AudioStudio
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            onGenerateSceneTts={handleGenerateSceneTts}
            onGenerateAllTts={handleGenerateAllTts}
            generatingTtsSceneId={generatingTtsSceneId}
            isBatchGeneratingTts={isBatchGeneratingTts}
            ttsError={ttsError}
          />
        )}

        {activeTab === 'assets' && (
          <AssetManager
            assets={assets}
            stats={stats}
            scenes={activeProject.scenes}
            selectedSceneId={selectedSceneId}
            onAssignBrollToScene={(sceneId, asset) => {
              handleUpdateScene(sceneId, {
                brollAssetId: asset.id,
                brollUrl: asset.url,
              });
            }}
            onUploadAsset={handleUploadAsset}
            onDeleteAsset={handleDeleteAsset}
          />
        )}
      </main>

      <ExportModal
        project={activeProject}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onUpdateProject={handleUpdateProject}
      />
    </div>
  );
}
