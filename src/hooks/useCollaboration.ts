import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CentralAsset,
  CollaboratorPresence,
  Project,
  Scene,
  SceneComment,
  StorageStats,
  StudioTab,
} from '../types/studio';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UseCollaborationOptions {
  roomId: string;
  userName: string;
  onRemoteProjectSync: (project: Project) => void;
  onRemoteProjectPatch: (patch: Partial<Project>) => void;
  onRemoteSceneUpdate: (sceneId: string, patch: Partial<Scene>) => void;
  onRemoteSceneCreate: (scene: Scene) => void;
  onRemoteSceneDelete: (sceneId: string) => void;
  onRemoteSceneReorder: (sceneIds: string[]) => void;
  onRemoteCommentCreate: (comment: SceneComment) => void;
  onRemoteCommentResolve: (commentId: string, resolved: boolean) => void;
  onRemoteAssetAdded: (asset: CentralAsset, stats: StorageStats) => void;
  onRemoteAssetDeleted: (assetId: string, stats: StorageStats) => void;
}

export function useCollaboration(options: UseCollaborationOptions) {
  const { roomId, userName } = options;
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [clientId, setClientId] = useState<string>('');
  const [presence, setPresence] = useState<CollaboratorPresence[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const sendMessage = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(
        roomId
      )}&name=${encodeURIComponent(userName)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) setStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          const cb = callbacksRef.current;

          if (data.type === 'room:init') {
            setClientId(data.clientId || '');
            setPresence(data.presence || []);
            if (data.project) cb.onRemoteProjectSync(data.project);
          } else if (data.type === 'presence:list') {
            setPresence(data.presence || []);
          } else if (data.type === 'project:synced' && data.project) {
            cb.onRemoteProjectSync(data.project);
          } else if (data.type === 'project:patch' && data.patch) {
            cb.onRemoteProjectPatch(data.patch);
          } else if (data.type === 'scene:update' && data.sceneId && data.patch) {
            cb.onRemoteSceneUpdate(data.sceneId, data.patch);
          } else if (data.type === 'scene:create' && data.scene) {
            cb.onRemoteSceneCreate(data.scene);
          } else if (data.type === 'scene:delete' && data.sceneId) {
            cb.onRemoteSceneDelete(data.sceneId);
          } else if (data.type === 'scene:reorder' && Array.isArray(data.sceneIds)) {
            cb.onRemoteSceneReorder(data.sceneIds);
          } else if (data.type === 'comment:create' && data.comment) {
            cb.onRemoteCommentCreate(data.comment);
          } else if (data.type === 'comment:resolve' && data.commentId) {
            cb.onRemoteCommentResolve(data.commentId, Boolean(data.resolved));
          } else if (data.type === 'asset:added' && data.asset) {
            cb.onRemoteAssetAdded(data.asset, data.stats);
          } else if (data.type === 'asset:deleted' && data.assetId) {
            cb.onRemoteAssetDeleted(data.assetId, data.stats);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus('disconnected');
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId]);

  const updatePresence = useCallback(
    (payload: { name?: string; activeSceneId?: string | null; activeTab?: StudioTab }) => {
      sendMessage({ type: 'presence:update', ...payload });
    },
    [sendMessage]
  );

  return {
    status,
    clientId,
    presence,
    sendMessage,
    updatePresence,
  };
}
