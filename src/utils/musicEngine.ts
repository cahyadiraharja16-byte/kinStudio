/**
 * Real procedural Web Audio studio music synthesizer.
 * Renders deterministic multi-layer AudioBuffers (chords, bass, pulse/percussion)
 * for both live Studio preview and 4K video export audio mixing.
 */

export async function renderMusicBuffer(
  ctx: BaseAudioContext,
  presetId: string,
  durationSec: number
): Promise<AudioBuffer | null> {
  if (!presetId || presetId === 'tanpa-musik') {
    return null;
  }

  const sampleRate = ctx.sampleRate || 48000;
  const length = Math.max(1, Math.ceil(durationSec * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const masterGain = offline.createGain();
  masterGain.gain.value = 0.65;
  masterGain.connect(offline.destination);

  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value =
    presetId === 'dokumenter-pagi'
      ? 1800
      : presetId === 'fajar-editorial'
        ? 2600
        : 4200;
  lowpass.connect(masterGain);

  const bpm =
    presetId === 'dokumenter-pagi'
      ? 78
      : presetId === 'fajar-editorial'
        ? 92
        : presetId === 'momentum-kota'
          ? 116
          : 124;

  const beatSec = 60 / bpm;

  // Chord progressions in MIDI notes
  const progressions: Record<string, number[][]> = {
    'fajar-editorial': [
      [53, 57, 60, 64], // Fmaj7
      [55, 59, 62, 67], // G6
      [52, 55, 59, 64], // Em7
      [57, 60, 64, 67], // Am7
    ],
    'momentum-kota': [
      [48, 55, 60, 64], // C
      [55, 62, 67, 71], // G
      [57, 64, 69, 72], // Am
      [53, 60, 65, 69], // F
    ],
    'dokumenter-pagi': [
      [50, 57, 62, 65], // Dm
      [46, 53, 58, 62], // Bbmaj7
      [48, 55, 60, 64], // C
      [45, 52, 57, 60], // Am
    ],
    'peluncuran-produk': [
      [52, 59, 64, 67], // Em
      [48, 55, 60, 64], // C
      [55, 62, 67, 71], // G
      [50, 57, 62, 66], // D
    ],
  };

  const chords = progressions[presetId] || progressions['fajar-editorial'];
  const barSec = beatSec * 4;
  const totalBars = Math.ceil(durationSec / barSec);

  const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const barStart = bar * barSec;

    // Warm pad / Rhodes chord layer
    chord.forEach((midi, voiceIdx) => {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.type =
        presetId === 'momentum-kota'
          ? 'triangle'
          : presetId === 'peluncuran-produk'
            ? 'sawtooth'
            : 'sine';
      osc.frequency.setValueAtTime(midiToFreq(midi), barStart);

      const peak =
        presetId === 'peluncuran-produk'
          ? 0.055
          : presetId === 'momentum-kota'
            ? 0.075
            : 0.095;

      gain.gain.setValueAtTime(0.0001, barStart);
      gain.gain.linearRampToValueAtTime(peak, barStart + 0.14 + voiceIdx * 0.03);
      gain.gain.exponentialRampToValueAtTime(
        peak * 0.45,
        Math.min(durationSec, barStart + barSec - 0.06)
      );
      gain.gain.linearRampToValueAtTime(
        0.0001,
        Math.min(durationSec, barStart + barSec)
      );

      osc.connect(gain);
      gain.connect(lowpass);
      osc.start(barStart);
      osc.stop(Math.min(durationSec, barStart + barSec + 0.02));
    });

    // Sub-bass foundation
    const bassOsc = offline.createOscillator();
    const bassGain = offline.createGain();
    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(midiToFreq(chord[0] - 12), barStart);
    bassGain.gain.setValueAtTime(0.001, barStart);
    bassGain.gain.linearRampToValueAtTime(0.18, barStart + 0.08);
    bassGain.gain.exponentialRampToValueAtTime(
      0.06,
      Math.min(durationSec, barStart + barSec - 0.05)
    );
    bassGain.gain.linearRampToValueAtTime(
      0.0001,
      Math.min(durationSec, barStart + barSec)
    );
    bassOsc.connect(bassGain);
    bassGain.connect(lowpass);
    bassOsc.start(barStart);
    bassOsc.stop(Math.min(durationSec, barStart + barSec + 0.02));

    // Subtle arpeggio / rhythmic pulse per beat
    const stepsPerBar = presetId === 'dokumenter-pagi' ? 4 : 8;
    const stepSec = barSec / stepsPerBar;

    for (let s = 0; s < stepsPerBar; s++) {
      const t = barStart + s * stepSec;
      if (t >= durationSec) break;

      const noteMidi = chord[(s + bar) % chord.length] + 12;
      const pluckOsc = offline.createOscillator();
      const pluckGain = offline.createGain();
      pluckOsc.type = presetId === 'peluncuran-produk' ? 'triangle' : 'sine';
      pluckOsc.frequency.setValueAtTime(midiToFreq(noteMidi), t);

      const pluckAmp = presetId === 'dokumenter-pagi' ? 0.055 : 0.065;
      pluckGain.gain.setValueAtTime(0.0001, t);
      pluckGain.gain.linearRampToValueAtTime(pluckAmp, t + 0.015);
      pluckGain.gain.exponentialRampToValueAtTime(
        0.0005,
        Math.min(durationSec, t + stepSec * 0.85)
      );

      pluckOsc.connect(pluckGain);
      pluckGain.connect(lowpass);
      pluckOsc.start(t);
      pluckOsc.stop(Math.min(durationSec, t + stepSec));

      // Soft percussive pulse on downbeats for upbeat presets
      if (
        (presetId === 'momentum-kota' || presetId === 'peluncuran-produk') &&
        s % 2 === 0
      ) {
        const kickOsc = offline.createOscillator();
        const kickGain = offline.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(s % 4 === 0 ? 115 : 85, t);
        kickOsc.frequency.exponentialRampToValueAtTime(38, t + 0.09);

        kickGain.gain.setValueAtTime(s % 4 === 0 ? 0.16 : 0.07, t);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

        kickOsc.connect(kickGain);
        kickGain.connect(masterGain);
        kickOsc.start(t);
        kickOsc.stop(t + 0.12);
      }
    }
  }

  return offline.startRendering();
}
