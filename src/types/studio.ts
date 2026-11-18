export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type TransitionType =
  | 'crossfade'
  | 'slide-wipe'
  | 'wipe-vertical'
  | 'whip-pan'
  | 'zoom-cut'
  | 'iris-reveal'
  | 'film-flash';

export type MotionGraphicType =
  | 'lower-third'
  | 'kinetic-title'
  | 'stat-callout'
  | 'caption-bold'
  | 'none';

export type KenBurnsDirection =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right';

export type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export type StudioTab = 'script' | 'visual' | 'audio' | 'assets';

export interface MotionGraphicConfig {
  type: MotionGraphicType;
  headline: string;
  subline: string;
  accentColor: string;
}

export interface Scene {
  id: string;
  title: string;
  role: string;
  durationSec: number;
  narration: string;
  visualDirection: string;
  brollKeywords: string[];
  brollAssetId: string | null;
  brollUrl: string;
  motionGraphic: MotionGraphicConfig;
  transition: TransitionType;
  transitionDurationSec?: number;
  kenBurns: KenBurnsDirection;
  ttsAudioUrl?: string;
  ttsVoiceName?: VoiceName;
  ttsDurationSec?: number;
}

export interface HookVariant {
  id: string;
  hookType: string;
  headline: string;
  narration: string;
  visualCue: string;
  retentionAngle: string;
}

export interface SceneComment {
  id: string;
  sceneId: string;
  authorName: string;
  authorColor: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface SrtCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface Project {
  id: string;
  title: string;
  topic: string;
  languageStyle: string;
  audience: string;
  ctaGoal: string;
  aspectRatio: AspectRatio;
  voiceName: VoiceName;
  voiceStylePrompt: string;
  musicPresetId: string;
  musicVolume: number;
  voiceVolume: number;
  hooks: HookVariant[];
  scenes: Scene[];
  comments: SceneComment[];
  srtCues?: SrtCue[];
  updatedAt: string;
}

export type AssetCategory = 'broll' | 'audio-tts' | 'music' | 'upload';

export interface CentralAsset {
  id: string;
  name: string;
  category: AssetCategory;
  mimeType: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  resolution?: string;
  durationSec?: number;
  isSystem?: boolean;
  createdAt: string;
}

export interface StorageStats {
  totalAssets: number;
  totalBytes: number;
  dedupSavedBytes: number;
  dedupHits: number;
}

export interface CollaboratorPresence {
  clientId: string;
  name: string;
  color: string;
  activeSceneId: string | null;
  activeTab: StudioTab;
  joinedAt: string;
}

export interface MusicPreset {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  durationLabel: string;
  description: string;
}

export const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: 'fajar-editorial',
    name: 'Fajar Editorial',
    mood: 'Hangat & Fokus',
    bpm: 92,
    durationLabel: 'Loop Adaptif',
    description: 'Rhodes elektrik lembut dan denyut bass analog untuk konten edukasi dan opini.',
  },
  {
    id: 'momentum-kota',
    name: 'Momentum Kota',
    mood: 'Dinamis & Modern',
    bpm: 116,
    durationLabel: 'Loop Adaptif',
    description: 'Arpeggio synth presisi dengan perkusi minimalis untuk ulasan teknologi dan bisnis.',
  },
  {
    id: 'dokumenter-pagi',
    name: 'Dokumenter Pagi',
    mood: 'Tenang & Reflektif',
    bpm: 78,
    durationLabel: 'Loop Adaptif',
    description: 'Piano akustik felt dengan pad atmosferik untuk narasi investigatif dan dokumenter.',
  },
  {
    id: 'peluncuran-produk',
    name: 'Peluncuran Produk',
    mood: 'Energik & Tajam',
    bpm: 124,
    durationLabel: 'Loop Adaptif',
    description: 'Groove ritmis cepat dengan aksen perkusi jernih untuk iklan singkat dan Reels.',
  },
  {
    id: 'tanpa-musik',
    name: 'Tanpa Musik Latar',
    mood: 'Vokal Murni',
    bpm: 0,
    durationLabel: 'Hening',
    description: 'Hanya menggunakan trek suara narasi TTS tanpa lapisan musik latar.',
  },
];

export const VOICE_PERSONAS: Array<{
  id: VoiceName;
  label: string;
  character: string;
  defaultStyle: string;
}> = [
  {
    id: 'Kore',
    label: 'Kore',
    character: 'Hangat, jernih & artikulatif',
    defaultStyle: 'Pembawa acara dokumenter modern berbahasa Indonesia yang hangat, natural, dan jelas.',
  },
  {
    id: 'Puck',
    label: 'Puck',
    character: 'Energik, cepat & persuasif',
    defaultStyle: 'Kreator video pendek yang antusias, ekspresif, dan bertempo cepat untuk hook 3 detik.',
  },
  {
    id: 'Charon',
    label: 'Charon',
    character: 'Dalam, tenang & berwibawa',
    defaultStyle: 'Narator berita dan analisis bisnis dengan intonasi rendah, stabil, dan terpercaya.',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir',
    character: 'Tegas, berkarakter & sinematik',
    defaultStyle: 'Narator film pendek dan studi kasus investigatif yang tegas dengan jeda dramatis.',
  },
  {
    id: 'Zephyr',
    label: 'Zephyr',
    character: 'Ramah, ringan & edukatif',
    defaultStyle: 'Pengajar dan mentor produk digital yang bersahabat, santai, dan mudah diikuti.',
  },
];

export const LANGUAGE_STYLES: string[] = [
  'Edukatif & Tajam',
  'Kasual TikTok & Reels',
  'Sinematik & Puitis',
  'Profesional Korporat',
  'Storytelling Investigatif',
  'Persuasif Peluncuran Produk',
];

export interface TransitionPresetMeta {
  id: TransitionType;
  name: string;
  category: 'Halus' | 'Geometris' | 'Dinamis';
  description: string;
  defaultDurationSec: number;
}

export const TRANSITION_PRESETS: TransitionPresetMeta[] = [
  {
    id: 'crossfade',
    name: 'Dissolve / Crossfade',
    category: 'Halus',
    description: 'Pudar silang lembut antar bingkai untuk alur dokumenter dan narasi tenang.',
    defaultDurationSec: 0.6,
  },
  {
    id: 'slide-wipe',
    name: 'Slide Horizontal',
    category: 'Geometris',
    description: 'Adegan baru mendorong adegan sebelumnya dari kanan ke kiri secara presisi.',
    defaultDurationSec: 0.5,
  },
  {
    id: 'wipe-vertical',
    name: 'Wipe Tirai Vertikal',
    category: 'Geometris',
    description: 'Singkap vertikal dari bawah ke atas dengan garis pemisah bersih.',
    defaultDurationSec: 0.55,
  },
  {
    id: 'whip-pan',
    name: 'Whip Pan Kamera',
    category: 'Dinamis',
    description: 'Sapuan kamera cepat berkecepatan tinggi untuk menjaga ritme hook media sosial.',
    defaultDurationSec: 0.35,
  },
  {
    id: 'zoom-cut',
    name: 'Zoom Cut Optik',
    category: 'Dinamis',
    description: 'Dorongan lensa masuk cepat yang mengunci fokus audiens ke adegan berikutnya.',
    defaultDurationSec: 0.4,
  },
  {
    id: 'iris-reveal',
    name: 'Iris Aperture Reveal',
    category: 'Geometris',
    description: 'Bukaan diafragma melingkar dari pusat frame untuk sorotan produk atau poin kunci.',
    defaultDurationSec: 0.65,
  },
  {
    id: 'film-flash',
    name: 'Film Exposure Flash',
    category: 'Dinamis',
    description: 'Kilatan cahaya eksposur singkat khas transisi editorial modern.',
    defaultDurationSec: 0.4,
  },
];
