import { GoogleGenAI, Type } from '@google/genai';
import type {
  AspectRatio,
  CentralAsset,
  HookVariant,
  Scene,
  SrtCue,
  VoiceName,
} from '../src/types/studio.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum dikonfigurasi. Silakan periksa panel Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GenerateScriptInput {
  topic: string;
  languageStyle: string;
  aspectRatio: AspectRatio;
  targetDurationSec: number;
  audience: string;
  ctaGoal: string;
  availableAssets: CentralAsset[];
}

export interface GeneratedScriptResult {
  title: string;
  recommendedMusicId: string;
  hooks: HookVariant[];
  scenes: Scene[];
}

export async function generateVideoScript(
  input: GenerateScriptInput
): Promise<GeneratedScriptResult> {
  const ai = getAiClient();
  const brollCatalog = input.availableAssets
    .filter((a) => a.category === 'broll' || a.category === 'upload')
    .map((a) => `- id: "${a.id}", nama: "${a.name}", tag: [${a.tags.join(', ')}]`)
    .join('\n');

  const prompt = `Buat paket naskah produksi video lengkap dalam Bahasa Indonesia yang alami, tajam, dan siap produksi.
Topik: ${input.topic}
Gaya Bahasa: ${input.languageStyle}
Format & Rasio Video: ${input.aspectRatio}
Target Total Durasi: sekitar ${input.targetDurationSec} detik (bagi menjadi 4 hingga 6 adegan yang ritmis)
Target Audiens: ${input.audience || 'Kreator dan audiens media sosial profesional'}
Tujuan Ajakan (CTA): ${input.ctaGoal || 'Ajak audiens mencoba atau membagikan informasi ini'}

Katalog Aset B-Roll Terpusat yang tersedia (pilih brollAssetId yang paling relevan dari daftar ini jika cocok, atau pilih yang terdekat secara visual):
${brollCatalog}

Katalog Musik Latar tersedia (pilih recommendedMusicId dari salah satu id berikut):
- "fajar-editorial" (Hangat & Fokus, edukasi/opini)
- "momentum-kota" (Dinamis & Modern, teknologi/bisnis)
- "dokumenter-pagi" (Tenang & Reflektif, dokumenter/storytelling)
- "peluncuran-produk" (Energik & Tajam, Reels/iklan cepat)

Aturan penting:
1. Buat 3 variasi HOOK 3 detik pertama yang sangat kuat dan berbeda sudut psikologisnya (misal: Fakta Kontras, Pertanyaan Tajam, Pernyataan Berani).
2. Pastikan Adegan 01 langsung memakai hook terbaik dengan narasi yang memikat dalam 3 detik pertama tanpa basa-basi seperti "Halo guys".
3. Setiap adegan wajib menyertakan arahan visual B-roll yang konkret, kata kunci B-roll, pilihan motion graphic (type: 'lower-third' | 'kinetic-title' | 'stat-callout' | 'caption-bold' | 'none') dengan headline singkat maksimal 5 kata dan subline maksimal 8 kata, serta transisi ('crossfade' | 'slide-wipe' | 'wipe-vertical' | 'whip-pan' | 'zoom-cut' | 'iris-reveal' | 'film-flash') dan arah kenBurns ('zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right').`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Anda adalah kepala penulis naskah dan sutradara kreatif video komersial berbahasa Indonesia. Hasilkan JSON yang presisi, bebas klise, ritmis saat dibacakan (spoken-word friendly), dan tanpa pembukaan basa-basi.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          recommendedMusicId: { type: Type.STRING },
          hooks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hookType: { type: Type.STRING },
                headline: { type: Type.STRING },
                narration: { type: Type.STRING },
                visualCue: { type: Type.STRING },
                retentionAngle: { type: Type.STRING },
              },
              required: [
                'hookType',
                'headline',
                'narration',
                'visualCue',
                'retentionAngle',
              ],
            },
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                role: { type: Type.STRING },
                durationSec: { type: Type.NUMBER },
                narration: { type: Type.STRING },
                visualDirection: { type: Type.STRING },
                brollKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                brollAssetId: { type: Type.STRING },
                motionGraphicType: { type: Type.STRING },
                motionHeadline: { type: Type.STRING },
                motionSubline: { type: Type.STRING },
                transition: { type: Type.STRING },
                kenBurns: { type: Type.STRING },
              },
              required: [
                'title',
                'role',
                'durationSec',
                'narration',
                'visualDirection',
                'brollKeywords',
                'brollAssetId',
                'motionGraphicType',
                'motionHeadline',
                'motionSubline',
                'transition',
                'kenBurns',
              ],
            },
          },
        },
        required: ['title', 'recommendedMusicId', 'hooks', 'scenes'],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Model tidak mengembalikan isi naskah.');
  }

  const parsed = JSON.parse(rawText) as {
    title: string;
    recommendedMusicId: string;
    hooks: Array<{
      hookType: string;
      headline: string;
      narration: string;
      visualCue: string;
      retentionAngle: string;
    }>;
    scenes: Array<{
      title: string;
      role: string;
      durationSec: number;
      narration: string;
      visualDirection: string;
      brollKeywords: string[];
      brollAssetId: string;
      motionGraphicType: string;
      motionHeadline: string;
      motionSubline: string;
      transition: string;
      kenBurns: string;
    }>;
  };

  const brollPool = input.availableAssets.filter(
    (a) => a.category === 'broll' || a.category === 'upload'
  );
  const validTransitions = new Set([
    'crossfade',
    'slide-wipe',
    'wipe-vertical',
    'whip-pan',
    'zoom-cut',
    'iris-reveal',
    'film-flash',
  ]);
  const validMotionTypes = new Set([
    'lower-third',
    'kinetic-title',
    'stat-callout',
    'caption-bold',
    'none',
  ]);
  const validKenBurns = new Set([
    'zoom-in',
    'zoom-out',
    'pan-left',
    'pan-right',
  ]);

  const mappedScenes: Scene[] = parsed.scenes.map((sc, idx) => {
    const matchedAsset =
      brollPool.find((a) => a.id === sc.brollAssetId) ||
      brollPool.find((a) =>
        sc.brollKeywords.some((kw) =>
          a.tags.some((t) => t.toLowerCase().includes(kw.toLowerCase()))
        )
      ) ||
      brollPool[idx % Math.max(1, brollPool.length)];

    const mgType = validMotionTypes.has(sc.motionGraphicType)
      ? (sc.motionGraphicType as Scene['motionGraphic']['type'])
      : idx === 0
        ? 'kinetic-title'
        : 'lower-third';

    const trType = validTransitions.has(sc.transition)
      ? (sc.transition as Scene['transition'])
      : 'crossfade';

    const kbType = validKenBurns.has(sc.kenBurns)
      ? (sc.kenBurns as Scene['kenBurns'])
      : 'zoom-in';

    return {
      id: `scene-${Date.now()}-${idx + 1}`,
      title: sc.title,
      role: sc.role,
      durationSec: Math.max(3, Math.min(20, Math.round(sc.durationSec || 6))),
      narration: sc.narration,
      visualDirection: sc.visualDirection,
      brollKeywords: sc.brollKeywords || [],
      brollAssetId: matchedAsset ? matchedAsset.id : null,
      brollUrl: matchedAsset
        ? matchedAsset.url
        : '/src/assets/images/broll_creator_studio_1794867128517.jpg',
      motionGraphic: {
        type: mgType,
        headline: sc.motionHeadline || sc.title,
        subline: sc.motionSubline || '',
        accentColor: '#2563EB',
      },
      transition: trType,
      kenBurns: kbType,
    };
  });

  const mappedHooks: HookVariant[] = parsed.hooks.map((hk, idx) => ({
    id: `hook-${Date.now()}-${idx + 1}`,
    hookType: hk.hookType,
    headline: hk.headline,
    narration: hk.narration,
    visualCue: hk.visualCue,
    retentionAngle: hk.retentionAngle,
  }));

  return {
    title: parsed.title,
    recommendedMusicId: parsed.recommendedMusicId || 'fajar-editorial',
    hooks: mappedHooks,
    scenes: mappedScenes,
  };
}

export interface GenerateFromDocumentInput {
  rawScript: string;
  fileName?: string;
  languageStyle: string;
  aspectRatio: AspectRatio;
  preserveOriginalText: boolean;
  availableAssets: CentralAsset[];
}

export async function generateProjectFromScriptDocument(
  input: GenerateFromDocumentInput
): Promise<GeneratedScriptResult & { topic: string }> {
  const ai = getAiClient();
  const brollCatalog = input.availableAssets
    .filter((a) => a.category === 'broll' || a.category === 'upload')
    .map((a) => `- id: "${a.id}", nama: "${a.name}", tag: [${a.tags.join(', ')}]`)
    .join('\n');

  const wordingRule = input.preserveOriginalText
    ? 'WAJIB pertahankan isi teks materi/narasi asli dari dokumen pengguna secara utuh dan akurat (hanya bersihkan simbol Markdown seperti #, **, atau label waktu/durasi agar siap dibacakan TTS dan Teleprompter).'
    : `Adaptasi dan pertajam penyampaian kalimat materi agar mengalir alami saat dibacakan (spoken-word) dengan gaya bahasa "${input.languageStyle}", namun tetap mempertahankan seluruh poin informasi dan fakta dari dokumen asli.`;

  const prompt = `Analisis dokumen naskah (${input.fileName || 'dokumen teks/Markdown'}) berikut yang sudah berisi materi beserta keterangan waktu atau durasi per segmen, lalu ubah menjadi proyek produksi video terstruktur.

Dokumen Naskah Pengguna:
"""
${input.rawScript}
"""

Preferensi Produksi:
- Gaya Bahasa: ${input.languageStyle}
- Format & Rasio Video: ${input.aspectRatio}
- Aturan Teks Narasi: ${wordingRule}

Katalog Aset B-Roll Terpusat yang tersedia (pilih brollAssetId paling relevan dari daftar ini untuk setiap adegan):
${brollCatalog}

Katalog Musik Latar tersedia (pilih recommendedMusicId dari salah satu id berikut):
- "fajar-editorial" (Hangat & Fokus, edukasi/opini)
- "momentum-kota" (Dinamis & Modern, teknologi/bisnis)
- "dokumenter-pagi" (Tenang & Reflektif, dokumenter/storytelling)
- "peluncuran-produk" (Energik & Tajam, Reels/iklan cepat)

Aturan Parsing Waktu, Durasi & Produksi:
1. Baca dengan teliti setiap penanda waktu atau durasi pada dokumen (misal rentang "00:00 - 00:12" = 12 detik, "0:15–0:35" = 20 detik, "Durasi: 10 detik" / "10s" / "10d" = 10 detik, atau selisih antar timestamp berurutan). Gunakan durasi aktual tersebut pada field durationSec tiap adegan. Jika ada segmen tanpa keterangan waktu, estimasikan dari panjang kata (~2.4 kata/detik).
2. Pecah dokumen menjadi adegan-adegan (scenes) secara berurutan sesuai struktur materi di dokumen.
3. Buat juga 3 variasi HOOK 3-detik yang relevan dengan inti dokumen.
4. Untuk setiap adegan, tentukan arahan visual B-roll (visualDirection), kata kunci (brollKeywords), brollAssetId dari katalog, pilihan motionGraphicType ('lower-third' | 'kinetic-title' | 'stat-callout' | 'caption-bold' | 'none'), motionHeadline (maks 5 kata), motionSubline (maks 8 kata), transition ('crossfade' | 'slide-wipe' | 'wipe-vertical' | 'whip-pan' | 'zoom-cut' | 'iris-reveal' | 'film-flash'), dan kenBurns ('zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right').
5. Tentukan judul proyek (title) dan ringkasan topik singkat (topic) dalam Bahasa Indonesia.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Anda adalah sutradara produksi video dan parser naskah terstruktur. Tugas Anda mengekstrak setiap materi beserta durasi/waktu persisnya dari file teks atau Markdown menjadi JSON adegan video siap produksi lengkap dengan B-roll, motion graphic, dan transisi.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          topic: { type: Type.STRING },
          recommendedMusicId: { type: Type.STRING },
          hooks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hookType: { type: Type.STRING },
                headline: { type: Type.STRING },
                narration: { type: Type.STRING },
                visualCue: { type: Type.STRING },
                retentionAngle: { type: Type.STRING },
              },
              required: [
                'hookType',
                'headline',
                'narration',
                'visualCue',
                'retentionAngle',
              ],
            },
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                role: { type: Type.STRING },
                durationSec: { type: Type.NUMBER },
                narration: { type: Type.STRING },
                visualDirection: { type: Type.STRING },
                brollKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                brollAssetId: { type: Type.STRING },
                motionGraphicType: { type: Type.STRING },
                motionHeadline: { type: Type.STRING },
                motionSubline: { type: Type.STRING },
                transition: { type: Type.STRING },
                kenBurns: { type: Type.STRING },
              },
              required: [
                'title',
                'role',
                'durationSec',
                'narration',
                'visualDirection',
                'brollKeywords',
                'brollAssetId',
                'motionGraphicType',
                'motionHeadline',
                'motionSubline',
                'transition',
                'kenBurns',
              ],
            },
          },
        },
        required: ['title', 'topic', 'recommendedMusicId', 'hooks', 'scenes'],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Model tidak mengembalikan hasil penguraian naskah.');
  }

  const parsed = JSON.parse(rawText) as {
    title: string;
    topic: string;
    recommendedMusicId: string;
    hooks: Array<{
      hookType: string;
      headline: string;
      narration: string;
      visualCue: string;
      retentionAngle: string;
    }>;
    scenes: Array<{
      title: string;
      role: string;
      durationSec: number;
      narration: string;
      visualDirection: string;
      brollKeywords: string[];
      brollAssetId: string;
      motionGraphicType: string;
      motionHeadline: string;
      motionSubline: string;
      transition: string;
      kenBurns: string;
    }>;
  };

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('Tidak ditemukan adegan materi yang valid dari dokumen.');
  }

  const brollPool = input.availableAssets.filter(
    (a) => a.category === 'broll' || a.category === 'upload'
  );
  const validTransitions = new Set([
    'crossfade',
    'slide-wipe',
    'wipe-vertical',
    'whip-pan',
    'zoom-cut',
    'iris-reveal',
    'film-flash',
  ]);
  const validMotionTypes = new Set([
    'lower-third',
    'kinetic-title',
    'stat-callout',
    'caption-bold',
    'none',
  ]);
  const validKenBurns = new Set([
    'zoom-in',
    'zoom-out',
    'pan-left',
    'pan-right',
  ]);

  const mappedScenes: Scene[] = parsed.scenes.map((sc, idx) => {
    const matchedAsset =
      brollPool.find((a) => a.id === sc.brollAssetId) ||
      brollPool.find((a) =>
        (sc.brollKeywords || []).some((kw) =>
          a.tags.some((t) => t.toLowerCase().includes(kw.toLowerCase()))
        )
      ) ||
      brollPool[idx % Math.max(1, brollPool.length)];

    const mgType = validMotionTypes.has(sc.motionGraphicType)
      ? (sc.motionGraphicType as Scene['motionGraphic']['type'])
      : idx === 0
        ? 'kinetic-title'
        : 'lower-third';

    const trType = validTransitions.has(sc.transition)
      ? (sc.transition as Scene['transition'])
      : 'crossfade';

    const kbType = validKenBurns.has(sc.kenBurns)
      ? (sc.kenBurns as Scene['kenBurns'])
      : 'zoom-in';

    return {
      id: `scene-${Date.now()}-${idx + 1}`,
      title: sc.title || `Materi ${String(idx + 1).padStart(2, '0')}`,
      role: sc.role || 'Materi',
      durationSec: Math.max(2, Math.min(300, Math.round(sc.durationSec || 6))),
      narration: sc.narration,
      visualDirection: sc.visualDirection || 'B-roll editorial studio yang relevan.',
      brollKeywords: sc.brollKeywords || [],
      brollAssetId: matchedAsset ? matchedAsset.id : null,
      brollUrl: matchedAsset
        ? matchedAsset.url
        : '/src/assets/images/broll_creator_studio_1794867128517.jpg',
      motionGraphic: {
        type: mgType,
        headline: sc.motionHeadline || sc.title,
        subline: sc.motionSubline || '',
        accentColor: '#2563EB',
      },
      transition: trType,
      kenBurns: kbType,
    };
  });

  const mappedHooks: HookVariant[] = (parsed.hooks || []).map((hk, idx) => ({
    id: `hook-${Date.now()}-${idx + 1}`,
    hookType: hk.hookType,
    headline: hk.headline,
    narration: hk.narration,
    visualCue: hk.visualCue,
    retentionAngle: hk.retentionAngle,
  }));

  return {
    title: parsed.title || input.fileName?.replace(/\.[^/.]+$/, '') || 'Proyek Naskah Impor',
    topic: parsed.topic || input.fileName || 'Naskah materi terimpor',
    recommendedMusicId: parsed.recommendedMusicId || 'fajar-editorial',
    hooks: mappedHooks,
    scenes: mappedScenes,
  };
}

export async function generateHooksOnly(input: {
  topic: string;
  languageStyle: string;
  currentNarration: string;
}): Promise<HookVariant[]> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Buat 3 variasi Hook pembuka video 3-detik dalam Bahasa Indonesia untuk topik "${input.topic}" dengan gaya bahasa "${input.languageStyle}".
Konteks saat ini: ${input.currentNarration}
Setiap hook harus langsung memancing rasa ingin tahu di kalimat pertama, ringkas (12-26 kata), dan siap dibacakan.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            hookType: { type: Type.STRING },
            headline: { type: Type.STRING },
            narration: { type: Type.STRING },
            visualCue: { type: Type.STRING },
            retentionAngle: { type: Type.STRING },
          },
          required: [
            'hookType',
            'headline',
            'narration',
            'visualCue',
            'retentionAngle',
          ],
        },
      },
    },
  });

  const raw = response.text;
  if (!raw) throw new Error('Gagal membuat variasi hook.');
  const arr = JSON.parse(raw) as Array<{
    hookType: string;
    headline: string;
    narration: string;
    visualCue: string;
    retentionAngle: string;
  }>;

  return arr.map((item, idx) => ({
    id: `hook-${Date.now()}-${idx + 1}`,
    ...item,
  }));
}

export async function polishSceneNarration(input: {
  narration: string;
  instruction: string;
  languageStyle: string;
  topic: string;
}): Promise<{ narration: string; headline: string }> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Perbaiki narasi adegan video berikut dalam Bahasa Indonesia sesuai instruksi: "${input.instruction}".
Topik proyek: ${input.topic}
Gaya bahasa: ${input.languageStyle}
Narasi asli: "${input.narration}"
Berikan narasi baru yang enak didengar saat dibacakan (voiceover) dan headline motion graphic singkat (maks 5 kata).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          narration: { type: Type.STRING },
          headline: { type: Type.STRING },
        },
        required: ['narration', 'headline'],
      },
    },
  });

  const raw = response.text;
  if (!raw) throw new Error('Gagal menyunting ulang adegan.');
  return JSON.parse(raw) as { narration: string; headline: string };
}

export async function generateVoiceoverWav(input: {
  text: string;
  voiceName: VoiceName;
  stylePrompt: string;
}): Promise<Buffer> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: input.text,
            speechMetadata: {
              style:
                input.stylePrompt ||
                'Pembawa acara video berbahasa Indonesia yang alami, jelas, dan hangat.',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: input.voiceName || 'Kore',
          },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Model TTS tidak mengembalikan data audio.');
  }

  return Buffer.from(base64Audio, 'base64');
}

export interface BrollSuggestionItem {
  assetId: string;
  reason: string;
  recommendedKenBurns: Scene['kenBurns'];
}

export async function suggestBrollForScene(input: {
  sceneTitle: string;
  narration: string;
  visualDirection: string;
  availableAssets: CentralAsset[];
}): Promise<BrollSuggestionItem[]> {
  const ai = getAiClient();
  const visualPool = input.availableAssets.filter(
    (a) => a.category === 'broll' || a.category === 'upload'
  );

  if (visualPool.length === 0) {
    throw new Error('Tidak ada aset visual di pustaka terpusat.');
  }

  const catalogText = visualPool
    .map(
      (a) =>
        `- id: "${a.id}", nama: "${a.name}", resolusi: "${a.resolution || 'HD'}", tag: [${a.tags.join(', ')}]`
    )
    .join('\n');

  const prompt = `Analisis narasi adegan video berikut dan pilih tepat 3 (atau sebanyak mungkin jika aset < 3) klip B-roll paling relevan dari Pustaka Aset Terpusat, diurutkan dari yang paling cocok hingga urutan ketiga.

Judul Adegan: ${input.sceneTitle}
Narasi Adegan: "${input.narration}"
Arahan Visual Tambahan: ${input.visualDirection || '-'}

Daftar Pustaka Aset Visual Terpusat:
${catalogText}

Aturan:
1. Gunakan HANYA assetId persis seperti yang tercantum di daftar di atas.
2. Jelaskan secara singkat (maksimal 16 kata dalam Bahasa Indonesia) mengapa klip tersebut memperkuat pesan narasi.
3. Rekomendasikan arah gerakan kamera (recommendedKenBurns): "zoom-in", "zoom-out", "pan-left", atau "pan-right".`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Anda adalah editor video dan kurator B-roll profesional. Pilih aset visual yang paling relevan secara tematik dan emosional dengan narasi.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            assetId: { type: Type.STRING },
            reason: { type: Type.STRING },
            recommendedKenBurns: { type: Type.STRING },
          },
          required: ['assetId', 'reason', 'recommendedKenBurns'],
        },
      },
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error('Model tidak mengembalikan rekomendasi B-roll.');
  }

  const parsed = JSON.parse(raw) as Array<{
    assetId: string;
    reason: string;
    recommendedKenBurns: string;
  }>;

  const validIds = new Set(visualPool.map((a) => a.id));
  const validKenBurns = new Set<Scene['kenBurns']>([
    'zoom-in',
    'zoom-out',
    'pan-left',
    'pan-right',
  ]);
  const seen = new Set<string>();
  const results: BrollSuggestionItem[] = [];

  for (const item of parsed) {
    if (!validIds.has(item.assetId) || seen.has(item.assetId)) continue;
    seen.add(item.assetId);
    results.push({
      assetId: item.assetId,
      reason: item.reason,
      recommendedKenBurns: validKenBurns.has(item.recommendedKenBurns as Scene['kenBurns'])
        ? (item.recommendedKenBurns as Scene['kenBurns'])
        : 'zoom-in',
    });
    if (results.length >= 3) break;
  }

  if (results.length === 0) {
    throw new Error('Tidak ditemukan kecocokan B-roll yang valid dari pustaka.');
  }

  return results;
}

export function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const totalMs = Math.round(safe * 1000);
  const hrs = Math.floor(totalMs / 3_600_000);
  const mins = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function cuesToSrtString(cues: SrtCue[]): string {
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${cue.text.trim()}\n`
    )
    .join('\n');
}

export interface SrtSceneInput {
  id: string;
  title: string;
  narration: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  ttsAudioBase64?: string;
}

export async function generateAiSrtSubtitles(input: {
  scenes: SrtSceneInput[];
}): Promise<{ cues: SrtCue[]; srtText: string; audioSyncedScenes: number }> {
  const ai = getAiClient();
  const activeScenes = input.scenes.filter(
    (sc) => sc.narration && sc.narration.trim().length > 0
  );

  if (activeScenes.length === 0) {
    throw new Error('Tidak ada teks narasi pada adegan untuk dibuatkan subtitle.');
  }

  let audioSyncedScenes = 0;

  const sceneCueArrays = await Promise.all(
    activeScenes.map(async (sc) => {
      const duration = Math.max(2, sc.durationSec || 5);
      const hasAudio = Boolean(sc.ttsAudioBase64);
      if (hasAudio) {
        audioSyncedScenes += 1;
      }

      const instructionPrompt = hasAudio
        ? `Dengarkan audio voiceover TTS (audio/wav) terlampir dan selaraskan dengan naskah persis berikut untuk adegan "${sc.title}" (total durasi adegan ${duration.toFixed(2)} detik).
Naskah asli adegan:
"${sc.narration.trim()}"

Tugas:
1. Pecah naskah tersebut menjadi segmen subtitle berbahasa Indonesia yang alami, mudah dibaca di layar video (maksimal 6-8 kata atau ~42 karakter per segmen, boleh memakai tanda baca yang tepat dari naskah asli).
2. Tentukan startOffsetSec dan endOffsetSec (dalam detik relatif terhadap awal adegan ini, antara 0.00 sampai ${duration.toFixed(2)}) berdasarkan jeda napas, intonasi, dan kecepatan ucapan aktual pada audio TTS.
3. Pastikan seluruh isi naskah asli tercakup berurutan tanpa memotong atau mengubah arti kata.`
        : `Pecah naskah narasi adegan "${sc.title}" berikut menjadi segmen subtitle berbahasa Indonesia yang alami dan ritmis untuk durasi ${duration.toFixed(2)} detik.
Naskah asli adegan:
"${sc.narration.trim()}"

Tugas:
1. Bagi menjadi segmen subtitle yang enak dibaca (maksimal 6-8 kata per segmen).
2. Hitung startOffsetSec dan endOffsetSec secara proporsional mengikuti panjang suku kata dan jeda tanda baca antara 0.00 sampai ${duration.toFixed(2)}.
3. Pertahankan kata-kata sesuai naskah asli secara berurutan.`;

      const contents = hasAudio
        ? {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: sc.ttsAudioBase64!,
                },
              },
              { text: instructionPrompt },
            ],
          }
        : instructionPrompt;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction:
            'Anda adalah ahli penyelarasan subtitle (forced audio-text aligner) profesional untuk produksi video 4K. Kembalikan JSON array berurutan dengan timestamp lokal yang akurat, tidak tumpang tindih, dan teks persis sesuai naskah.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startOffsetSec: { type: Type.NUMBER },
                endOffsetSec: { type: Type.NUMBER },
                text: { type: Type.STRING },
              },
              required: ['startOffsetSec', 'endOffsetSec', 'text'],
            },
          },
        },
      });

      const raw = response.text;
      if (!raw) {
        throw new Error(`Model gagal menghasilkan segmen subtitle untuk adegan "${sc.title}".`);
      }

      const parsed = JSON.parse(raw) as Array<{
        startOffsetSec: number;
        endOffsetSec: number;
        text: string;
      }>;

      const cleaned = parsed
        .map((item) => ({
          startOffsetSec: Number.isFinite(item.startOffsetSec)
            ? Math.max(0, Math.min(duration - 0.15, item.startOffsetSec))
            : 0,
          endOffsetSec: Number.isFinite(item.endOffsetSec)
            ? Math.max(0.15, Math.min(duration, item.endOffsetSec))
            : duration,
          text: String(item.text || '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((item) => item.text.length > 0)
        .sort((a, b) => a.startOffsetSec - b.startOffsetSec);

      if (cleaned.length === 0) {
        throw new Error(`Segmen subtitle kosong untuk adegan "${sc.title}".`);
      }

      // Ensure monotonic, non-overlapping timestamps within [0, duration]
      const normalized: Array<{ startSec: number; endSec: number; text: string }> = [];
      for (let i = 0; i < cleaned.length; i += 1) {
        const cur = cleaned[i];
        const prevEnd = i > 0 ? normalized[i - 1].endSec - sc.startSec : 0;
        const localStart = Math.max(prevEnd, cur.startOffsetSec);
        const nextRawStart =
          i < cleaned.length - 1 ? cleaned[i + 1].startOffsetSec : duration;
        const maxAllowedEnd = Math.min(duration, Math.max(localStart + 0.2, nextRawStart));
        const localEnd = Math.min(
          duration,
          Math.max(localStart + 0.2, Math.min(cur.endOffsetSec, maxAllowedEnd))
        );

        normalized.push({
          startSec: Number((sc.startSec + localStart).toFixed(3)),
          endSec: Number((sc.startSec + localEnd).toFixed(3)),
          text: cur.text,
        });
      }

      return normalized;
    })
  );

  const flattened = sceneCueArrays.flat();
  const cues: SrtCue[] = flattened.map((cue, idx) => ({
    index: idx + 1,
    startSec: cue.startSec,
    endSec: cue.endSec,
    text: cue.text,
  }));

  return {
    cues,
    srtText: cuesToSrtString(cues),
    audioSyncedScenes,
  };
}
