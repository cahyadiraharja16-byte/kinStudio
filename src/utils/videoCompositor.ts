import type { AspectRatio, Project, Scene, SrtCue } from '../types/studio';
import { renderMusicBuffer } from './musicEngine';

export interface SubtitleRenderOptions {
  burnSubtitles?: boolean;
  cues?: SrtCue[];
}

export interface TimedScene {
  scene: Scene;
  index: number;
  startSec: number;
  endSec: number;
}

export function computeTimeline(scenes: Scene[]): {
  timed: TimedScene[];
  totalDurationSec: number;
} {
  let cursor = 0;
  const timed: TimedScene[] = scenes.map((scene, index) => {
    const dur = Math.max(2, scene.durationSec || 5);
    const entry: TimedScene = {
      scene,
      index,
      startSec: cursor,
      endSec: cursor + dur,
    };
    cursor += dur;
    return entry;
  });
  return { timed, totalDurationSec: Math.max(1, cursor) };
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function getExportDimensions(
  aspectRatio: AspectRatio,
  quality: '4k' | '1080p' | '720p'
): { width: number; height: number; label: string } {
  const map: Record<
    AspectRatio,
    Record<'4k' | '1080p' | '720p', { width: number; height: number }>
  > = {
    '16:9': {
      '4k': { width: 3840, height: 2160 },
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
    },
    '9:16': {
      '4k': { width: 2160, height: 3840 },
      '1080p': { width: 1080, height: 1920 },
      '720p': { width: 720, height: 1280 },
    },
    '1:1': {
      '4k': { width: 2160, height: 2160 },
      '1080p': { width: 1080, height: 1080 },
      '720p': { width: 720, height: 720 },
    },
    '4:5': {
      '4k': { width: 2160, height: 2700 },
      '1080p': { width: 1080, height: 1350 },
      '720p': { width: 720, height: 900 },
    },
  };
  const dims = map[aspectRatio][quality];
  return { ...dims, label: `${dims.width}×${dims.height}` };
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  width: number,
  height: number,
  progress: number,
  kenBurns: Scene['kenBurns'],
  sceneIndex: number
): void {
  if (!img || !img.complete || img.naturalWidth === 0) {
    // Clean architectural daylight editorial fallback
    const grad = ctx.createLinearGradient(0, 0, width, height);
    const palettes = [
      ['#E2E8F0', '#CBD5E1'],
      ['#DBEAFE', '#E2E8F0'],
      ['#F1F5F9', '#CBD5E1'],
    ];
    const pal = palettes[sceneIndex % palettes.length];
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(1, pal[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  let scale = 1.04;
  let offsetX = 0;
  let offsetY = 0;

  if (kenBurns === 'zoom-in') {
    scale = 1.0 + progress * 0.1;
  } else if (kenBurns === 'zoom-out') {
    scale = 1.1 - progress * 0.09;
  } else if (kenBurns === 'pan-left') {
    scale = 1.1;
    offsetX = (0.5 - progress) * width * 0.05;
  } else if (kenBurns === 'pan-right') {
    scale = 1.1;
    offsetX = (progress - 0.5) * width * 0.05;
  }

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = width / height;

  let drawW = width;
  let drawH = height;
  if (imgRatio > canvasRatio) {
    drawH = height * scale;
    drawW = drawH * imgRatio;
  } else {
    drawW = width * scale;
    drawH = drawW / imgRatio;
  }

  const dx = (width - drawW) / 2 + offsetX;
  const dy = (height - drawH) / 2 + offsetY;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawMotionGraphicOverlay(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  localTime: number,
  duration: number,
  width: number,
  height: number,
  currentTimeSec: number,
  subtitleOptions?: SubtitleRenderOptions
): void {
  const mg = scene.motionGraphic;
  const unit = Math.min(width, height);
  const enter = easeOutCubic(Math.min(1, localTime / 0.45));
  const exit = localTime > duration - 0.35
    ? Math.max(0, (duration - localTime) / 0.35)
    : 1;
  const alpha = Math.min(enter, exit);
  const shouldBurnSubtitles = subtitleOptions?.burnSubtitles !== false;

  // Subtle bottom contrast scrim so captions and lower-thirds stay >4.5:1 legible
  if (shouldBurnSubtitles || (mg.type === 'lower-third' && mg.headline)) {
    const scrim = ctx.createLinearGradient(0, height * 0.56, 0, height);
    scrim.addColorStop(0, 'rgba(15, 23, 42, 0)');
    scrim.addColorStop(1, 'rgba(15, 23, 42, 0.72)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, height * 0.56, width, height * 0.44);
  }

  if (mg.type !== 'none' && mg.headline) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const slideOffset = (1 - enter) * unit * 0.04;

    if (mg.type === 'kinetic-title') {
      // Soft center scrim for clear legibility
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.fillRect(0, 0, width, height);

      const titleSize = Math.round(unit * 0.072);
      const subSize = Math.round(unit * 0.028);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      const maxW = width * 0.82;
      wrapTextCentered(
        ctx,
        mg.headline,
        width / 2,
        height * 0.46 + slideOffset,
        maxW,
        titleSize * 1.18
      );

      if (mg.subline) {
        ctx.font = `500 ${subSize}px "DM Sans", sans-serif`;
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(
          mg.subline,
          width / 2,
          height * 0.58 + slideOffset,
          maxW
        );
      }
    } else if (mg.type === 'lower-third') {
      const boxX = width * 0.06;
      const boxY = height * 0.69 + slideOffset;
      const padX = unit * 0.028;
      const padY = unit * 0.02;
      const headSize = Math.round(unit * 0.036);
      const subSize = Math.round(unit * 0.022);

      ctx.font = `700 ${headSize}px "Plus Jakarta Sans", sans-serif`;
      const headW = ctx.measureText(mg.headline).width;
      ctx.font = `500 ${subSize}px "DM Sans", sans-serif`;
      const subW = mg.subline ? ctx.measureText(mg.subline).width : 0;
      const cardW = Math.min(width * 0.84, Math.max(headW, subW) + padX * 2);
      const cardH = headSize + (mg.subline ? subSize + padY * 0.6 : 0) + padY * 1.8;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      roundRect(ctx, boxX, boxY, cardW, cardH, unit * 0.014);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0F172A';
      ctx.font = `700 ${headSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(mg.headline, boxX + padX, boxY + padY * 0.85, cardW - padX * 2);

      if (mg.subline) {
        ctx.fillStyle = '#475569';
        ctx.font = `500 ${subSize}px "DM Sans", sans-serif`;
        ctx.fillText(
          mg.subline,
          boxX + padX,
          boxY + padY * 0.95 + headSize + padY * 0.35,
          cardW - padX * 2
        );
      }
    } else if (mg.type === 'stat-callout') {
      const boxX = width * 0.06;
      const boxY = height * 0.1 + slideOffset;
      const headSize = Math.round(unit * 0.075);
      const subSize = Math.round(unit * 0.024);
      const pad = unit * 0.026;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      const boxW = Math.min(width * 0.72, unit * 0.56);
      const boxH = headSize + subSize + pad * 2.1;
      roundRect(ctx, boxX, boxY, boxW, boxH, unit * 0.016);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#60A5FA';
      ctx.font = `700 ${headSize}px "JetBrains Mono", monospace`;
      ctx.fillText(mg.headline, boxX + pad, boxY + pad * 0.8, boxW - pad * 2);

      if (mg.subline) {
        ctx.fillStyle = '#F8FAFC';
        ctx.font = `500 ${subSize}px "DM Sans", sans-serif`;
        ctx.fillText(
          mg.subline,
          boxX + pad,
          boxY + pad * 0.9 + headSize,
          boxW - pad * 2
        );
      }
    } else if (mg.type === 'caption-bold') {
      const headSize = Math.round(unit * 0.056);
      const subSize = Math.round(unit * 0.026);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${headSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(
        mg.headline,
        width / 2,
        height * 0.48 + slideOffset,
        width * 0.84
      );
      if (mg.subline) {
        ctx.fillStyle = '#CBD5E1';
        ctx.font = `500 ${subSize}px "DM Sans", sans-serif`;
        ctx.fillText(
          mg.subline,
          width / 2,
          height * 0.56 + slideOffset,
          width * 0.8
        );
      }
    }
    ctx.restore();
  }

  // Burned-in SRT subtitles or synchronized narration captions
  if (!shouldBurnSubtitles) {
    return;
  }

  let captionText = '';
  const cues = subtitleOptions?.cues;
  if (cues && cues.length > 0) {
    const activeCue = cues.find(
      (c) => currentTimeSec >= c.startSec && currentTimeSec < c.endSec
    );
    if (activeCue) {
      captionText = activeCue.text.trim();
    }
  } else {
    const words = (scene.narration || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const progress = Math.max(0, Math.min(0.999, localTime / duration));
      const chunkSize = width < height ? 4 : 6;
      const totalChunks = Math.ceil(words.length / chunkSize);
      const activeChunkIdx = Math.min(
        totalChunks - 1,
        Math.floor(progress * totalChunks)
      );
      captionText = words
        .slice(activeChunkIdx * chunkSize, (activeChunkIdx + 1) * chunkSize)
        .join(' ');
    }
  }

  if (captionText) {
    const capSize = Math.round(unit * 0.032);
    const maxTextWidth = width * 0.82;
    ctx.save();
    ctx.font = `600 ${capSize}px "Plus Jakarta Sans", sans-serif`;

    // Wrap up to 2 lines cleanly for 4K & vertical formats
    const capWords = captionText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const w of capWords) {
      const candidate = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(candidate).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = capSize * 1.28;
    const widestLine = lines.reduce(
      (max, ln) => Math.max(max, ctx.measureText(ln).width),
      0
    );
    const textW = Math.min(maxTextWidth, widestLine);
    const padX = unit * 0.028;
    const padY = unit * 0.015;
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineHeight + padY * 1.5;
    const boxX = (width - boxW) / 2;
    const boxY = Math.min(height * 0.89 - boxH / 2, height - boxH - height * 0.05);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    roundRect(ctx, boxX, boxY, boxW, boxH, unit * 0.012);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const firstLineY = boxY + padY * 0.75 + lineHeight / 2;
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, width / 2, firstLineY + idx * lineHeight, maxTextWidth);
    });
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, startY + idx * lineHeight, maxWidth);
  });
}

export function drawTransitionBlend(
  ctx: CanvasRenderingContext2D,
  transitionType: Scene['transition'],
  trRaw: number,
  prevImg: HTMLImageElement | undefined,
  activeImg: HTMLImageElement | undefined,
  prevKenBurns: Scene['kenBurns'],
  activeKenBurns: Scene['kenBurns'],
  prevIndex: number,
  activeIndex: number,
  activeProgress: number,
  width: number,
  height: number
): void {
  const tr = easeOutCubic(trRaw);

  if (transitionType === 'crossfade') {
    drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
    ctx.save();
    ctx.globalAlpha = tr;
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
    ctx.restore();
  } else if (transitionType === 'slide-wipe') {
    const shiftX = (1 - tr) * width;
    ctx.save();
    ctx.translate(-tr * width * 0.3, 0);
    drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
    ctx.restore();

    ctx.save();
    ctx.translate(shiftX, 0);
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
    ctx.restore();
  } else if (transitionType === 'whip-pan') {
    const shiftX = (1 - tr) * width;
    ctx.save();
    ctx.translate(-tr * width, 0);
    drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
    ctx.restore();

    ctx.save();
    ctx.translate(shiftX, 0);
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
    ctx.restore();

    // Directional speed veil peak in mid-whip
    const veilAlpha = Math.sin(tr * Math.PI) * 0.24;
    if (veilAlpha > 0.01) {
      ctx.fillStyle = `rgba(248, 250, 252, ${veilAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else if (transitionType === 'wipe-vertical') {
    drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
    const revealTop = (1 - tr) * height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, revealTop, width, height - revealTop);
    ctx.clip();
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
    ctx.restore();
  } else if (transitionType === 'iris-reveal') {
    drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
    const maxRadius = Math.hypot(width / 2, height / 2) * 1.05;
    ctx.save();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.max(1, tr * maxRadius), 0, Math.PI * 2);
    ctx.clip();
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
    ctx.restore();
  } else if (transitionType === 'zoom-cut') {
    if (tr < 0.35) {
      const outScale = 1 + (tr / 0.35) * 0.22;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(outScale, outScale);
      ctx.translate(-width / 2, -height / 2);
      drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
      ctx.restore();
    } else {
      const inProgress = (tr - 0.35) / 0.65;
      const zoomScale = 1.24 - easeOutCubic(inProgress) * 0.24;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoomScale, zoomScale);
      ctx.translate(-width / 2, -height / 2);
      drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
      ctx.restore();
    }
  } else if (transitionType === 'film-flash') {
    if (tr < 0.3) {
      drawCoverImage(ctx, prevImg, width, height, 1, prevKenBurns, prevIndex);
      ctx.fillStyle = `rgba(255, 255, 255, ${(tr / 0.3) * 0.92})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
      const fadeOut = 1 - (tr - 0.3) / 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, fadeOut * 0.92)})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawCoverImage(ctx, activeImg, width, height, activeProgress, activeKenBurns, activeIndex);
  }
}

export function renderCompositorFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  currentTimeSec: number,
  width: number,
  height: number,
  imageCache: Map<string, HTMLImageElement>,
  subtitleOptions?: SubtitleRenderOptions
): void {
  const { timed, totalDurationSec } = computeTimeline(project.scenes);
  if (timed.length === 0) {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const clampedTime = Math.max(0, Math.min(totalDurationSec - 0.001, currentTimeSec));
  const currentIdx = timed.findIndex(
    (t) => clampedTime >= t.startSec && clampedTime < t.endSec
  );
  const active = timed[currentIdx >= 0 ? currentIdx : 0];
  const prev = currentIdx > 0 ? timed[currentIdx - 1] : null;

  const localTime = clampedTime - active.startSec;
  const duration = active.endSec - active.startSec;
  const progress = Math.max(0, Math.min(1, localTime / duration));
  const transDur = Math.max(
    0.2,
    Math.min(1.5, active.scene.transitionDurationSec ?? 0.55)
  );

  ctx.clearRect(0, 0, width, height);

  const activeImg = imageCache.get(active.scene.brollUrl);
  const prevImg = prev ? imageCache.get(prev.scene.brollUrl) : undefined;

  if (prev && localTime < transDur) {
    drawTransitionBlend(
      ctx,
      active.scene.transition,
      localTime / transDur,
      prevImg,
      activeImg,
      prev.scene.kenBurns,
      active.scene.kenBurns,
      prev.index,
      active.index,
      progress,
      width,
      height
    );
  } else {
    drawCoverImage(ctx, activeImg, width, height, progress, active.scene.kenBurns, active.index);
  }

  drawMotionGraphicOverlay(
    ctx,
    active.scene,
    localTime,
    duration,
    width,
    height,
    clampedTime,
    subtitleOptions
  );
}

export async function preloadProjectImages(
  scenes: Scene[]
): Promise<Map<string, HTMLImageElement>> {
  const cache = new Map<string, HTMLImageElement>();
  const urls = Array.from(new Set(scenes.map((s) => s.brollUrl).filter(Boolean)));
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            cache.set(url, img);
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = url;
        })
    )
  );
  return cache;
}

export interface ExportVideoOptions {
  project: Project;
  quality: '4k' | '1080p' | '720p';
  fps: 30 | 60;
  burnSubtitles?: boolean;
  subtitleCues?: SrtCue[];
  onProgress: (pct: number, statusText: string) => void;
  abortSignal?: AbortSignal;
}

export async function exportProjectToVideo(
  options: ExportVideoOptions
): Promise<{ blob: Blob; mimeType: string; extension: string; width: number; height: number }> {
  const {
    project,
    quality,
    fps,
    burnSubtitles = true,
    subtitleCues,
    onProgress,
    abortSignal,
  } = options;
  const subtitleOptions: SubtitleRenderOptions = {
    burnSubtitles,
    cues: subtitleCues ?? project.srtCues,
  };
  const { timed, totalDurationSec } = computeTimeline(project.scenes);
  const dims = getExportDimensions(project.aspectRatio, quality);

  onProgress(5, `Memuat aset visual ${dims.label}...`);
  const imageCache = await preloadProjectImages(project.scenes);

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context tidak tersedia di peramban ini.');
  }

  // Prepare audio mixing graph
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const dest = audioCtx.createMediaStreamDestination();

  onProgress(14, 'Merender trek musik latar & audio narasi...');
  const musicBuffer = await renderMusicBuffer(
    audioCtx,
    project.musicPresetId,
    totalDurationSec
  );

  // Decode TTS clips if present
  const decodedTts = new Map<string, AudioBuffer>();
  for (const item of timed) {
    if (item.scene.ttsAudioUrl) {
      try {
        const res = await fetch(item.scene.ttsAudioUrl);
        if (res.ok) {
          const arr = await res.arrayBuffer();
          const buf = await audioCtx.decodeAudioData(arr);
          decodedTts.set(item.scene.id, buf);
        }
      } catch {
        // Ignore decode failure for individual clip
      }
    }
  }

  // Pick best supported MediaRecorder mimeType
  const candidateTypes = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const selectedMime =
    candidateTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

  const videoStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const videoBitsPerSecond =
    quality === '4k' ? 24_000_000 : quality === '1080p' ? 10_000_000 : 5_000_000;

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: selectedMime,
    videoBitsPerSecond,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  // Schedule audio sources relative to start
  const startAudioTime = audioCtx.currentTime + 0.08;
  const activeSources: AudioBufferSourceNode[] = [];

  if (musicBuffer) {
    const musicSource = audioCtx.createBufferSource();
    musicSource.buffer = musicBuffer;
    const musicGain = audioCtx.createGain();
    const hasTts = decodedTts.size > 0;
    musicGain.gain.value = hasTts
      ? Math.max(0.08, project.musicVolume * 0.55)
      : project.musicVolume;
    musicSource.connect(musicGain);
    musicGain.connect(dest);
    musicSource.start(startAudioTime);
    activeSources.push(musicSource);
  }

  for (const item of timed) {
    const ttsBuf = decodedTts.get(item.scene.id);
    if (ttsBuf) {
      const ttsSource = audioCtx.createBufferSource();
      ttsSource.buffer = ttsBuf;
      const ttsGain = audioCtx.createGain();
      ttsGain.gain.value = project.voiceVolume;
      ttsSource.connect(ttsGain);
      ttsGain.connect(dest);
      ttsSource.start(startAudioTime + item.startSec);
      activeSources.push(ttsSource);
    }
  }

  return new Promise((resolve, reject) => {
    let rafId = 0;
    let stopped = false;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      activeSources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // ignore
        }
      });
      audioCtx.close().catch(() => {});
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        cleanup();
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new Error('Ekspor video dibatalkan.'));
      });
    }

    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(chunks, { type: selectedMime });
      const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
      onProgress(100, 'Master video selesai dirender.');
      resolve({
        blob,
        mimeType: selectedMime,
        extension: ext,
        width: dims.width,
        height: dims.height,
      });
    };

    recorder.onerror = () => {
      cleanup();
      reject(new Error('Perekam video mengalami kesalahan saat encoding.'));
    };

    // Draw initial frame before starting recorder
    renderCompositorFrame(
      ctx,
      project,
      0,
      dims.width,
      dims.height,
      imageCache,
      subtitleOptions
    );
    recorder.start(250);

    const startWall = performance.now();
    const tick = () => {
      if (stopped) return;
      const elapsedSec = (performance.now() - startWall) / 1000;
      if (elapsedSec >= totalDurationSec) {
        renderCompositorFrame(
          ctx,
          project,
          totalDurationSec - 0.01,
          dims.width,
          dims.height,
          imageCache,
          subtitleOptions
        );
        onProgress(98, 'Menyelesaikan berkas kontainer video...');
        recorder.stop();
        return;
      }

      renderCompositorFrame(
        ctx,
        project,
        elapsedSec,
        dims.width,
        dims.height,
        imageCache,
        subtitleOptions
      );
      const pct = Math.min(96, Math.round(18 + (elapsedSec / totalDurationSec) * 78));
      onProgress(
        pct,
        `Merender frame ${dims.label} · ${formatTimecode(elapsedSec)} / ${formatTimecode(totalDurationSec)}`
      );
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  });
}

function toSrtTime(sec: number): string {
  const safe = Math.max(0, sec);
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
        `${cue.index}\n${toSrtTime(cue.startSec)} --> ${toSrtTime(cue.endSec)}\n${cue.text.trim()}\n`
    )
    .join('\n');
}

export function generateSrtContent(project: Project): string {
  if (project.srtCues && project.srtCues.length > 0) {
    return cuesToSrtString(project.srtCues);
  }
  const { timed } = computeTimeline(project.scenes);
  return timed
    .map(
      (item, idx) =>
        `${idx + 1}\n${toSrtTime(item.startSec)} --> ${toSrtTime(item.endSec)}\n${item.scene.narration.trim()}\n`
    )
    .join('\n');
}

export function generateScriptMarkdown(project: Project): string {
  const { timed, totalDurationSec } = computeTimeline(project.scenes);
  const lines = [
    `# ${project.title}`,
    '',
    `- Topik: ${project.topic}`,
    `- Gaya Bahasa: ${project.languageStyle}`,
    `- Format Rasio: ${project.aspectRatio}`,
    `- Total Durasi: ${totalDurationSec} detik`,
    `- Suara Narasi: ${project.voiceName}`,
    '',
    '## Adegan Produksi',
    '',
  ];

  timed.forEach((item) => {
    lines.push(
      `### ${String(item.index + 1).padStart(2, '0')}. ${item.scene.title} (${formatTimecode(item.startSec)} - ${formatTimecode(item.endSec)})`
    );
    lines.push(`- Peran: ${item.scene.role}`);
    lines.push(`- Narasi: "${item.scene.narration}"`);
    lines.push(`- Arahan Visual / B-Roll: ${item.scene.visualDirection}`);
    lines.push(
      `- Motion Graphic: ${item.scene.motionGraphic.type} — ${item.scene.motionGraphic.headline}`
    );
    lines.push(`- Transisi Masuk: ${item.scene.transition}`);
    lines.push('');
  });

  return lines.join('\n');
}
