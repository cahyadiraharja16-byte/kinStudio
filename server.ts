import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  generateAiSrtSubtitles,
  generateHooksOnly,
  generateProjectFromScriptDocument,
  generateVideoScript,
  generateVoiceoverWav,
  polishSceneNarration,
  suggestBrollForScene,
} from './server/gemini.ts';
import { SEED_ASSETS, SEED_PROJECTS } from './server/seed.ts';
import type {
  CentralAsset,
  CollaboratorPresence,
  Project,
  Scene,
  SceneComment,
  StorageStats,
  StudioTab,
  VoiceName,
} from './src/types/studio.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'studio-store.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface StoreData {
  projects: Project[];
  assets: CentralAsset[];
  dedupSavedBytes: number;
  dedupHits: number;
}

function loadStore(): StoreData {
  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoreData;
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.assets)) {
        return parsed;
      }
    } catch {
      // Fall back to clean seed store if file is unreadable
    }
  }
  const initial: StoreData = {
    projects: structuredClone(SEED_PROJECTS),
    assets: structuredClone(SEED_ASSETS),
    dedupSavedBytes: 0,
    dedupHits: 0,
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  return initial;
}

const store = loadStore();
let persistTimer: NodeJS.Timeout | null = null;

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist store:', err);
    }
  }, 150);
}

function getStorageStats(): StorageStats {
  const totalBytes = store.assets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
  return {
    totalAssets: store.assets.length,
    totalBytes,
    dedupSavedBytes: store.dedupSavedBytes,
    dedupHits: store.dedupHits,
  };
}

function registerAssetBuffer(input: {
  name: string;
  category: CentralAsset['category'];
  mimeType: string;
  ext: string;
  buffer: Buffer;
  tags: string[];
  resolution?: string;
  durationSec?: number;
}): { asset: CentralAsset; deduplicated: boolean } {
  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
  const existing = store.assets.find((a) => a.sha256 === sha256);
  if (existing) {
    store.dedupSavedBytes += input.buffer.length;
    store.dedupHits += 1;
    schedulePersist();
    return { asset: existing, deduplicated: true };
  }

  const fileName = `${Date.now()}-${sha256.slice(0, 10)}.${input.ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, input.buffer);

  const asset: CentralAsset = {
    id: `asset-${Date.now()}-${sha256.slice(0, 6)}`,
    name: input.name,
    category: input.category,
    mimeType: input.mimeType,
    url: `/uploads/${fileName}`,
    sizeBytes: input.buffer.length,
    sha256,
    tags: input.tags,
    resolution: input.resolution,
    durationSec: input.durationSec,
    isSystem: false,
    createdAt: new Date().toISOString(),
  };

  store.assets.unshift(asset);
  schedulePersist();
  return { asset, deduplicated: false };
}

function parseWavDurationSec(wavBuffer: Buffer): number {
  if (wavBuffer.length <= 44) return 3;
  // Standard Gemini TTS WAV is 24kHz, mono, 16-bit (48,000 bytes/sec)
  const byteRate =
    wavBuffer.length >= 32 ? wavBuffer.readUInt32LE(28) || 48000 : 48000;
  const dataBytes = Math.max(0, wavBuffer.length - 44);
  return Math.max(1.5, Number((dataBytes / byteRate).toFixed(1)));
}

// --- WebSocket Real-Time Collaboration ---
interface ConnectedClient {
  ws: WebSocket;
  roomId: string;
  presence: CollaboratorPresence;
}

const roomClients = new Map<string, Map<string, ConnectedClient>>();
const COLLAB_COLORS = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#DB2777'];

function getRoomPresence(roomId: string): CollaboratorPresence[] {
  const map = roomClients.get(roomId);
  if (!map) return [];
  return Array.from(map.values()).map((c) => c.presence);
}

function broadcastToRoom(
  roomId: string,
  payload: unknown,
  excludeClientId?: string
): void {
  const map = roomClients.get(roomId);
  if (!map) return;
  const serialized = JSON.stringify(payload);
  for (const [cid, client] of map.entries()) {
    if (excludeClientId && cid === excludeClientId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function broadcastAllRooms(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const map of roomClients.values()) {
    for (const client of map.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(serialized);
      }
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // --- Projects REST API ---
  app.get('/api/projects', (_req, res) => {
    res.json({
      projects: store.projects,
      assets: store.assets,
      stats: getStorageStats(),
    });
  });

  app.post('/api/projects', (req, res) => {
    const body = req.body as Partial<Project>;
    const newProject: Project = {
      id: body.id || `proj-${Date.now()}`,
      title: body.title || 'Proyek Video Baru',
      topic: body.topic || '',
      languageStyle: body.languageStyle || 'Edukatif & Tajam',
      audience: body.audience || 'Audiens media sosial profesional',
      ctaGoal: body.ctaGoal || 'Ikuti untuk wawasan berikutnya',
      aspectRatio: body.aspectRatio || '16:9',
      voiceName: body.voiceName || 'Kore',
      voiceStylePrompt:
        body.voiceStylePrompt ||
        'Pembawa acara video berbahasa Indonesia yang alami, hangat, dan jernih.',
      musicPresetId: body.musicPresetId || 'fajar-editorial',
      musicVolume: body.musicVolume ?? 0.28,
      voiceVolume: body.voiceVolume ?? 1.0,
      hooks: body.hooks || [],
      scenes: body.scenes || [],
      comments: body.comments || [],
      updatedAt: new Date().toISOString(),
    };
    store.projects.unshift(newProject);
    schedulePersist();
    res.json({ project: newProject });
  });

  // --- Centralized Assets API ---
  app.get('/api/assets', (_req, res) => {
    res.json({
      assets: store.assets,
      stats: getStorageStats(),
    });
  });

  app.post('/api/assets/upload', (req, res) => {
    try {
      const { name, mimeType, dataBase64, tags, resolution } = req.body as {
        name: string;
        mimeType: string;
        dataBase64: string;
        tags?: string[];
        resolution?: string;
      };

      if (!name || !mimeType || !dataBase64) {
        res.status(400).json({ error: 'Data berkas tidak lengkap.' });
        return;
      }

      const cleanBase64 = dataBase64.includes(',')
        ? dataBase64.split(',')[1]
        : dataBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');
      const isAudio = mimeType.startsWith('audio/');
      const ext = mimeType.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || (isAudio ? 'wav' : 'png');

      const result = registerAssetBuffer({
        name,
        category: isAudio ? 'audio-tts' : 'upload',
        mimeType,
        ext,
        buffer,
        tags: Array.isArray(tags) && tags.length > 0 ? tags : ['unggahan', isAudio ? 'audio' : 'visual'],
        resolution,
      });

      broadcastAllRooms({
        type: 'asset:added',
        asset: result.asset,
        stats: getStorageStats(),
      });

      res.json({
        asset: result.asset,
        deduplicated: result.deduplicated,
        stats: getStorageStats(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah aset.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/assets/:id', (req, res) => {
    const idx = store.assets.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Aset tidak ditemukan.' });
      return;
    }
    const target = store.assets[idx];
    if (target.isSystem) {
      res.status(400).json({ error: 'Aset bawaan studio tidak dapat dihapus.' });
      return;
    }
    store.assets.splice(idx, 1);
    if (target.url.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(target.url));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    schedulePersist();
    broadcastAllRooms({
      type: 'asset:deleted',
      assetId: target.id,
      stats: getStorageStats(),
    });
    res.json({ deletedId: target.id, stats: getStorageStats() });
  });

  // --- AI Routes (Gemini API) ---
  app.post('/api/ai/generate-script', async (req, res) => {
    try {
      const {
        projectId,
        topic,
        languageStyle,
        aspectRatio,
        targetDurationSec,
        audience,
        ctaGoal,
      } = req.body as {
        projectId?: string;
        topic: string;
        languageStyle: string;
        aspectRatio: Project['aspectRatio'];
        targetDurationSec: number;
        audience: string;
        ctaGoal: string;
      };

      if (!topic || !topic.trim()) {
        res.status(400).json({ error: 'Topik video wajib diisi.' });
        return;
      }

      const generated = await generateVideoScript({
        topic: topic.trim(),
        languageStyle: languageStyle || 'Edukatif & Tajam',
        aspectRatio: aspectRatio || '16:9',
        targetDurationSec: Number(targetDurationSec) || 45,
        audience: audience || '',
        ctaGoal: ctaGoal || '',
        availableAssets: store.assets,
      });

      const targetProj = store.projects.find((p) => p.id === projectId);
      if (targetProj) {
        targetProj.title = generated.title;
        targetProj.topic = topic.trim();
        targetProj.languageStyle = languageStyle || targetProj.languageStyle;
        targetProj.aspectRatio = aspectRatio || targetProj.aspectRatio;
        targetProj.audience = audience || targetProj.audience;
        targetProj.ctaGoal = ctaGoal || targetProj.ctaGoal;
        targetProj.musicPresetId = generated.recommendedMusicId;
        targetProj.hooks = generated.hooks;
        targetProj.scenes = generated.scenes;
        targetProj.srtCues = undefined;
        targetProj.updatedAt = new Date().toISOString();
        schedulePersist();

        broadcastToRoom(targetProj.id, {
          type: 'project:synced',
          project: targetProj,
        });
      }

      res.json({ generated, project: targetProj || null });
    } catch (err) {
      console.error('Error /api/ai/generate-script:', err);
      const message =
        err instanceof Error ? err.message : 'Gagal membuat naskah dengan AI.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/generate-from-document', async (req, res) => {
    try {
      const {
        projectId,
        rawScript,
        fileName,
        languageStyle,
        aspectRatio,
        preserveOriginalText,
      } = req.body as {
        projectId?: string;
        rawScript: string;
        fileName?: string;
        languageStyle: string;
        aspectRatio: Project['aspectRatio'];
        preserveOriginalText?: boolean;
      };

      if (!rawScript || !rawScript.trim()) {
        res.status(400).json({
          error: 'Isi naskah (.txt atau .md) wajib diisi atau diunggah terlebih dahulu.',
        });
        return;
      }

      const generated = await generateProjectFromScriptDocument({
        rawScript: rawScript.trim().slice(0, 60_000),
        fileName,
        languageStyle: languageStyle || 'Edukatif & Tajam',
        aspectRatio: aspectRatio || '16:9',
        preserveOriginalText: preserveOriginalText !== false,
        availableAssets: store.assets,
      });

      const targetProj = store.projects.find((p) => p.id === projectId);
      if (targetProj) {
        targetProj.title = generated.title;
        targetProj.topic = generated.topic;
        targetProj.languageStyle = languageStyle || targetProj.languageStyle;
        targetProj.aspectRatio = aspectRatio || targetProj.aspectRatio;
        targetProj.musicPresetId = generated.recommendedMusicId;
        targetProj.hooks = generated.hooks;
        targetProj.scenes = generated.scenes;
        targetProj.srtCues = undefined;
        targetProj.updatedAt = new Date().toISOString();
        schedulePersist();

        broadcastToRoom(targetProj.id, {
          type: 'project:synced',
          project: targetProj,
        });
      }

      res.json({ generated, project: targetProj || null });
    } catch (err) {
      console.error('Error /api/ai/generate-from-document:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal mengolah dokumen naskah menjadi proyek video.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/generate-hooks', async (req, res) => {
    try {
      const { projectId, topic, languageStyle, currentNarration } = req.body as {
        projectId?: string;
        topic: string;
        languageStyle: string;
        currentNarration: string;
      };

      const hooks = await generateHooksOnly({
        topic,
        languageStyle,
        currentNarration,
      });

      const targetProj = store.projects.find((p) => p.id === projectId);
      if (targetProj) {
        targetProj.hooks = hooks;
        targetProj.updatedAt = new Date().toISOString();
        schedulePersist();
        broadcastToRoom(targetProj.id, {
          type: 'project:patch',
          patch: { hooks },
        });
      }

      res.json({ hooks });
    } catch (err) {
      console.error('Error /api/ai/generate-hooks:', err);
      const message =
        err instanceof Error ? err.message : 'Gagal membuat variasi hook.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/polish-scene', async (req, res) => {
    try {
      const { narration, instruction, languageStyle, topic } = req.body as {
        narration: string;
        instruction: string;
        languageStyle: string;
        topic: string;
      };
      const result = await polishSceneNarration({
        narration,
        instruction,
        languageStyle,
        topic,
      });
      res.json(result);
    } catch (err) {
      console.error('Error /api/ai/polish-scene:', err);
      const message =
        err instanceof Error ? err.message : 'Gagal memoles narasi adegan.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/suggest-broll', async (req, res) => {
    try {
      const { sceneTitle, narration, visualDirection } = req.body as {
        sceneTitle?: string;
        narration?: string;
        visualDirection?: string;
      };

      if (!narration || !narration.trim()) {
        res.status(400).json({
          error: 'Narasi adegan kosong. Tambahkan narasi terlebih dahulu untuk dianalisis.',
        });
        return;
      }

      const ranked = await suggestBrollForScene({
        sceneTitle: sceneTitle || 'Adegan',
        narration: narration.trim(),
        visualDirection: visualDirection || '',
        availableAssets: store.assets,
      });

      const suggestions = ranked
        .map((item) => {
          const asset = store.assets.find((a) => a.id === item.assetId);
          return asset ? { ...item, asset } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      res.json({ suggestions });
    } catch (err) {
      console.error('Error /api/ai/suggest-broll:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal menganalisis narasi untuk rekomendasi B-roll.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    try {
      const { projectId, sceneId, sceneTitle, text, voiceName, stylePrompt } =
        req.body as {
          projectId?: string;
          sceneId?: string;
          sceneTitle?: string;
          text: string;
          voiceName: VoiceName;
          stylePrompt: string;
        };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Teks narasi kosong.' });
        return;
      }

      const wavBuffer = await generateVoiceoverWav({
        text: text.trim(),
        voiceName: voiceName || 'Kore',
        stylePrompt: stylePrompt || '',
      });

      const durationSec = parseWavDurationSec(wavBuffer);
      const { asset, deduplicated } = registerAssetBuffer({
        name: `TTS · ${sceneTitle || 'Narasi'} (${voiceName || 'Kore'})`,
        category: 'audio-tts',
        mimeType: 'audio/wav',
        ext: 'wav',
        buffer: wavBuffer,
        tags: ['tts', 'narasi', (voiceName || 'Kore').toLowerCase()],
        durationSec,
      });

      if (projectId && sceneId) {
        const proj = store.projects.find((p) => p.id === projectId);
        const scene = proj?.scenes.find((s) => s.id === sceneId);
        if (proj && scene) {
          scene.ttsAudioUrl = asset.url;
          scene.ttsVoiceName = voiceName || 'Kore';
          scene.ttsDurationSec = durationSec;
          if (durationSec > scene.durationSec) {
            scene.durationSec = Math.ceil(durationSec);
          }
          proj.updatedAt = new Date().toISOString();
          schedulePersist();

          broadcastToRoom(proj.id, {
            type: 'scene:update',
            sceneId: scene.id,
            patch: {
              ttsAudioUrl: scene.ttsAudioUrl,
              ttsVoiceName: scene.ttsVoiceName,
              ttsDurationSec: scene.ttsDurationSec,
              durationSec: scene.durationSec,
            },
          });
        }
      }

      broadcastAllRooms({
        type: 'asset:added',
        asset,
        stats: getStorageStats(),
      });

      res.json({
        audioUrl: asset.url,
        durationSec,
        asset,
        deduplicated,
        stats: getStorageStats(),
      });
    } catch (err) {
      console.error('Error /api/ai/tts:', err);
      const message =
        err instanceof Error ? err.message : 'Gagal menghasilkan audio TTS.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/generate-srt', async (req, res) => {
    try {
      const { projectId, scenes } = req.body as {
        projectId?: string;
        scenes?: Scene[];
      };

      const targetProj = store.projects.find((p) => p.id === projectId);
      const sourceScenes =
        Array.isArray(scenes) && scenes.length > 0
          ? scenes
          : targetProj?.scenes || [];

      if (sourceScenes.length === 0) {
        res.status(400).json({ error: 'Tidak ada adegan untuk dibuatkan subtitle SRT.' });
        return;
      }

      let cursor = 0;
      const preparedScenes = sourceScenes.map((sc) => {
        const durationSec = Math.max(2, sc.durationSec || 5);
        const startSec = cursor;
        const endSec = cursor + durationSec;
        cursor = endSec;

        let ttsAudioBase64: string | undefined;
        if (sc.ttsAudioUrl && sc.ttsAudioUrl.startsWith('/uploads/')) {
          const wavPath = path.join(UPLOADS_DIR, path.basename(sc.ttsAudioUrl));
          if (fs.existsSync(wavPath)) {
            ttsAudioBase64 = fs.readFileSync(wavPath).toString('base64');
          }
        }

        return {
          id: sc.id,
          title: sc.title,
          narration: sc.narration || '',
          durationSec,
          startSec,
          endSec,
          ttsAudioBase64,
        };
      });

      const result = await generateAiSrtSubtitles({ scenes: preparedScenes });

      if (targetProj) {
        targetProj.srtCues = result.cues;
        targetProj.updatedAt = new Date().toISOString();
        schedulePersist();
        broadcastToRoom(targetProj.id, {
          type: 'project:patch',
          patch: { srtCues: result.cues },
        });
      }

      res.json(result);
    } catch (err) {
      console.error('Error /api/ai/generate-srt:', err);
      const message =
        err instanceof Error ? err.message : 'Gagal membuat subtitle AI (.SRT).';
      res.status(500).json({ error: message });
    }
  });

  // --- HTTP & WebSocket Server ---
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    const roomId = reqUrl.searchParams.get('room') || store.projects[0]?.id || 'default';
    const userName = (reqUrl.searchParams.get('name') || 'Editor Tamu').slice(0, 32);
    const clientId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (!roomClients.has(roomId)) {
      roomClients.set(roomId, new Map());
    }
    const roomMap = roomClients.get(roomId)!;
    const color = COLLAB_COLORS[roomMap.size % COLLAB_COLORS.length];

    const presence: CollaboratorPresence = {
      clientId,
      name: userName,
      color,
      activeSceneId: null,
      activeTab: 'script',
      joinedAt: new Date().toISOString(),
    };

    roomMap.set(clientId, { ws, roomId, presence });

    const project =
      store.projects.find((p) => p.id === roomId) || store.projects[0];

    ws.send(
      JSON.stringify({
        type: 'room:init',
        clientId,
        project,
        presence: getRoomPresence(roomId),
      })
    );

    broadcastToRoom(
      roomId,
      {
        type: 'presence:list',
        presence: getRoomPresence(roomId),
      },
      clientId
    );

    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString()) as {
          type: string;
          [key: string]: unknown;
        };
        const targetProj = store.projects.find((p) => p.id === roomId);

        if (msg.type === 'presence:update') {
          if (typeof msg.name === 'string' && msg.name.trim()) {
            presence.name = msg.name.trim().slice(0, 32);
          }
          if (msg.activeSceneId !== undefined) {
            presence.activeSceneId =
              typeof msg.activeSceneId === 'string' ? msg.activeSceneId : null;
          }
          if (typeof msg.activeTab === 'string') {
            presence.activeTab = msg.activeTab as StudioTab;
          }
          broadcastToRoom(roomId, {
            type: 'presence:list',
            presence: getRoomPresence(roomId),
          });
          return;
        }

        if (!targetProj) return;

        if (msg.type === 'project:patch' && typeof msg.patch === 'object' && msg.patch) {
          Object.assign(targetProj, msg.patch);
          targetProj.updatedAt = new Date().toISOString();
          schedulePersist();
          broadcastToRoom(
            roomId,
            { type: 'project:patch', patch: msg.patch },
            clientId
          );
        } else if (
          msg.type === 'scene:update' &&
          typeof msg.sceneId === 'string' &&
          typeof msg.patch === 'object' &&
          msg.patch
        ) {
          const sc = targetProj.scenes.find((s) => s.id === msg.sceneId);
          if (sc) {
            Object.assign(sc, msg.patch);
            targetProj.updatedAt = new Date().toISOString();
            schedulePersist();
            broadcastToRoom(
              roomId,
              { type: 'scene:update', sceneId: msg.sceneId, patch: msg.patch },
              clientId
            );
          }
        } else if (msg.type === 'scene:create' && typeof msg.scene === 'object' && msg.scene) {
          const newScene = msg.scene as Scene;
          if (!targetProj.scenes.some((s) => s.id === newScene.id)) {
            targetProj.scenes.push(newScene);
            targetProj.updatedAt = new Date().toISOString();
            schedulePersist();
            broadcastToRoom(
              roomId,
              { type: 'scene:create', scene: newScene },
              clientId
            );
          }
        } else if (msg.type === 'scene:delete' && typeof msg.sceneId === 'string') {
          targetProj.scenes = targetProj.scenes.filter((s) => s.id !== msg.sceneId);
          targetProj.updatedAt = new Date().toISOString();
          schedulePersist();
          broadcastToRoom(
            roomId,
            { type: 'scene:delete', sceneId: msg.sceneId },
            clientId
          );
        } else if (msg.type === 'scene:reorder' && Array.isArray(msg.sceneIds)) {
          const order = msg.sceneIds as string[];
          const map = new Map(targetProj.scenes.map((s) => [s.id, s]));
          const reordered: Scene[] = [];
          for (const id of order) {
            const found = map.get(id);
            if (found) reordered.push(found);
          }
          if (reordered.length === targetProj.scenes.length) {
            targetProj.scenes = reordered;
            targetProj.updatedAt = new Date().toISOString();
            schedulePersist();
            broadcastToRoom(
              roomId,
              { type: 'scene:reorder', sceneIds: order },
              clientId
            );
          }
        } else if (msg.type === 'comment:create' && typeof msg.comment === 'object' && msg.comment) {
          const c = msg.comment as SceneComment;
          if (!targetProj.comments.some((existing) => existing.id === c.id)) {
            targetProj.comments.push(c);
            targetProj.updatedAt = new Date().toISOString();
            schedulePersist();
            broadcastToRoom(
              roomId,
              { type: 'comment:create', comment: c },
              clientId
            );
          }
        } else if (msg.type === 'comment:resolve' && typeof msg.commentId === 'string') {
          const c = targetProj.comments.find((item) => item.id === msg.commentId);
          if (c) {
            c.resolved = Boolean(msg.resolved);
            targetProj.updatedAt = new Date().toISOString();
            schedulePersist();
            broadcastToRoom(
              roomId,
              {
                type: 'comment:resolve',
                commentId: msg.commentId,
                resolved: c.resolved,
              },
              clientId
            );
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      roomMap.delete(clientId);
      broadcastToRoom(roomId, {
        type: 'presence:list',
        presence: getRoomPresence(roomId),
      });
    });
  });

  // --- Vite Dev Middleware or Static Production Build ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KineScript Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
