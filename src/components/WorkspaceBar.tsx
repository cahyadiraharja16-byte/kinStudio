import React, { useState } from 'react';
import { Check, FolderPlus, Share2, Users, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useCollaboration';
import type { CollaboratorPresence, Project } from '../types/studio';
import { computeTimeline, formatTimecode } from '../utils/videoCompositor';

interface WorkspaceBarProps {
  projects: Project[];
  activeProject: Project;
  onSelectProject: (projectId: string) => void;
  onCreateBlankProject: () => void;
  onUpdateTitle: (title: string) => void;
  connectionStatus: ConnectionStatus;
  presence: CollaboratorPresence[];
  currentClientId: string;
  userName: string;
  onChangeUserName: (name: string) => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onCreateBlankProject,
  onUpdateTitle,
  connectionStatus,
  presence,
  currentClientId,
  userName,
  onChangeUserName,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

  const { totalDurationSec } = computeTimeline(activeProject.scenes);

  const handleCopyCollabLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', activeProject.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      window.history.replaceState({}, '', url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) {
      onChangeUserName(trimmed);
    } else {
      setNameDraft(userName);
    }
    setEditingName(false);
  };

  return (
    <div className="bg-white border-b border-[#E2E8F0]">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Project Switcher + Title + Metadata */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden shrink-0">
            <select
              aria-label="Pilih proyek studio"
              value={activeProject.id}
              onChange={(e) => onSelectProject(e.target.value)}
              className="h-8 pl-2 pr-6 text-xs font-medium bg-transparent text-[#0F172A] max-w-[180px] truncate outline-none focus-visible:bg-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onCreateBlankProject}
              title="Buat proyek kosong baru"
              className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] border-l border-[#E2E8F0] whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baru</span>
            </button>
          </div>

          <input
            type="text"
            aria-label="Judul proyek"
            value={activeProject.title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            className="min-w-[140px] flex-1 max-w-sm h-8 text-[13px] font-semibold text-[#0F172A] bg-transparent border border-transparent hover:border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white rounded-md px-2 outline-none truncate"
          />

          <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-[#64748B] font-mono tabular-nums whitespace-nowrap shrink-0">
            <span>{activeProject.aspectRatio}</span>
            <span aria-hidden="true">·</span>
            <span>{activeProject.scenes.length} Adegan</span>
            <span aria-hidden="true">·</span>
            <span>{formatTimecode(totalDurationSec)}</span>
          </div>
        </div>

        {/* Right: Presence & Share Toolbar */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-1 text-[11px] whitespace-nowrap"
            title={
              connectionStatus === 'connected'
                ? 'Sinkronisasi real-time aktif'
                : connectionStatus === 'connecting'
                  ? 'Menghubungkan ke server kolaborasi'
                  : 'Koneksi kolaborasi terputus'
            }
          >
            {connectionStatus === 'connected' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-[#16A34A]" />
                <span className="text-[#16A34A] font-medium hidden sm:inline">Tersinkron</span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-[#D97706]" />
                <span className="text-[#D97706] font-medium hidden sm:inline">Menghubungkan</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#DC2626]" />
                <span className="text-[#DC2626] font-medium hidden sm:inline">Terputus</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5" aria-label="Kolaborator aktif">
              {presence.map((member) => {
                const isMe = member.clientId === currentClientId;
                return (
                  <div
                    key={member.clientId}
                    title={`${member.name}${isMe ? ' (Anda)' : ''}`}
                    style={{ backgroundColor: member.color }}
                    className="w-6 h-6 rounded-full border border-white flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                );
              })}
            </div>

            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitName();
                }}
              >
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitName}
                  autoFocus
                  maxLength={28}
                  className="h-7 w-24 px-2 text-xs border border-[#2563EB] rounded bg-white text-[#0F172A] outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(userName);
                  setEditingName(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                title="Klik untuk mengubah nama kolaborator Anda"
              >
                <Users className="w-3.5 h-3.5 text-[#64748B]" />
                <span>{presence.length} · {userName}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyCollabLink}
            title="Salin tautan kolaborasi tim"
            className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-md whitespace-nowrap shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                <span className="text-[#16A34A]">Disalin</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#475569]" />
                <span>Undang</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

