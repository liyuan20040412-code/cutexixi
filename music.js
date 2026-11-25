/**
 * 圣诞音频与实时律动引擎（零 60fps DOM/React 重渲染）
 * - 默认内置纯 Web Audio 圣诞八音盒（零外链、永不失效）
 * - 支持原版「上传本地音乐」，通过 AnalyserNode 实时提取频谱能量驱动圣诞树星光律动
 */
window.TreeAudio = (function () {
  const NOTE_FREQ = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77
  };

  const MELODY = [
    ['G4', 1, 'C4'],
    ['C5', 1, 'C4'], ['C5', 0.5, null], ['D5', 0.5, null], ['C5', 0.5, null], ['B4', 0.5, null],
    ['A4', 1, 'F3'], ['A4', 1, null], ['A4', 1, null],
    ['D5', 1, 'G3'], ['D5', 0.5, null], ['E5', 0.5, null], ['D5', 0.5, null], ['C5', 0.5, null],
    ['B4', 1, 'E3'], ['G4', 1, null], ['G4', 1, null],
    ['E5', 1, 'A3'], ['E5', 0.5, null], ['F5', 0.5, null], ['E5', 0.5, null], ['D5', 0.5, null],
    ['C5', 1, 'F3'], ['A4', 1, null], ['G4', 0.5, null], ['G4', 0.5, null],
    ['A4', 1, 'D3'], ['D5', 1, 'G3'], ['B4', 1, 'G3'],
    ['C5', 2.2, 'C4'], [null, 0.8, null],
    ['G4', 1.5, 'C4'], ['A4', 0.5, null], ['G4', 1, null],
    ['E4', 3, 'C4'],
    ['D5', 2, 'G3'], ['D5', 1, null],
    ['B4', 3, 'G3'],
    ['C5', 2, 'C4'], ['C5', 1, null],
    ['G4', 3, 'E3'],
    ['A4', 2, 'F3'], ['A4', 1, null],
    ['C5', 1.5, 'F3'], ['B4', 0.5, null], ['A4', 1, null],
    ['G4', 1.5, 'C4'], ['A4', 0.5, null], ['G4', 1, null],
    ['E4', 3, 'C4'],
    ['D5', 2, 'G3'], ['F5', 1.5, 'G3'], ['D5', 0.5, null], ['B4', 1, null],
    ['C5', 3, 'C4'], [null, 1.0, null]
  ];

  function create() {
    let ctx = null;
    let masterGain = null;
    let analyser = null;
    let freqBins = null;

    let audioEl = null;
    let mediaSrc = null;
    let customUrl = null;
    let trackName = '圣诞八音盒 · Merry Christmas';
    let useCustom = false;
    let playing = false;
    let noteTimer = null;
    let noteIdx = 0;
    let synthPulse = 0;

    function ensureAudioCtx() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        ctx = new AudioCtx();

        masterGain = ctx.createGain();
        masterGain.gain.value = 0.30;

        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        freqBins = new Uint8Array(analyser.frequencyBinCount);

        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.26;
        const fb = ctx.createGain();
        fb.gain.value = 0.30;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        const wet = ctx.createGain();
        wet.gain.value = 0.32;

        masterGain.connect(analyser);
        analyser.connect(ctx.destination);
        masterGain.connect(delay);
        delay.connect(lp);
        lp.connect(fb);
        fb.connect(delay);
        lp.connect(wet);
        wet.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return true;
    }

    function playBell(freq, start, dur, vol) {
      if (!ctx || !masterGain || !freq) return;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine';
      o2.type = 'triangle';
      o1.frequency.setValueAtTime(freq, start);
      o2.frequency.setValueAtTime(freq * 2.0, start);

      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      g1.gain.setValueAtTime(0.0001, start);
      g1.gain.linearRampToValueAtTime(vol, start + 0.014);
      g1.gain.exponentialRampToValueAtTime(0.0008, start + dur * 1.45);

      g2.gain.setValueAtTime(0.0001, start);
      g2.gain.linearRampToValueAtTime(vol * 0.22, start + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0005, start + dur * 0.65);

      o1.connect(g1); o2.connect(g2);
      g1.connect(masterGain); g2.connect(masterGain);
      o1.start(start); o2.start(start);
      o1.stop(start + dur * 1.55); o2.stop(start + dur * 1.55);
    }

    function stepSynth() {
      if (!playing || useCustom) return;
      const [mel, beats, bass] = MELODY[noteIdx];
      noteIdx = (noteIdx + 1) % MELODY.length;
      const dur = beats * 0.43;
      const now = ctx.currentTime + 0.02;

      if (mel && NOTE_FREQ[mel]) {
        playBell(NOTE_FREQ[mel], now, Math.max(0.45, dur), 0.72);
        synthPulse = beats >= 1.5 ? 0.85 : 0.58;
      }
      if (bass && NOTE_FREQ[bass]) {
        playBell(NOTE_FREQ[bass], now, Math.max(0.85, dur * 1.35), 0.34);
      }
      noteTimer = window.setTimeout(stepSynth, dur * 1000);
    }

    function stopSynth() {
      if (noteTimer) {
        clearTimeout(noteTimer);
        noteTimer = null;
      }
    }

    return {
      play() {
        if (!ensureAudioCtx()) return false;
        playing = true;
        if (useCustom && audioEl) {
          stopSynth();
          audioEl.play().catch(() => {});
        } else {
          stopSynth();
          stepSynth();
        }
        return true;
      },
      pause() {
        playing = false;
        stopSynth();
        if (audioEl && !audioEl.paused) {
          audioEl.pause();
        }
      },
      toggle() {
        if (playing) {
          this.pause();
          return false;
        }
        return this.play();
      },
      loadLocalFile(file) {
        if (!file) return trackName;
        if (!ensureAudioCtx()) return trackName;
        if (customUrl) URL.revokeObjectURL(customUrl);
        customUrl = URL.createObjectURL(file);
        trackName = file.name.replace(/\.[^.]+$/, '');
        useCustom = true;
        stopSynth();

        if (!audioEl) {
          audioEl = new Audio();
          audioEl.loop = true;
          audioEl.crossOrigin = 'anonymous';
          mediaSrc = ctx.createMediaElementSource(audioEl);
          mediaSrc.connect(analyser);
        }
        audioEl.src = customUrl;
        playing = true;
        audioEl.play().catch(() => {});
        return trackName;
      },
      getTrackName() {
        return trackName;
      },
      isPlaying() {
        return playing;
      },
      // 由 WebGL 渲染循环直接读取，零 GC、零重渲染
      getAudioLevel() {
        if (!playing) {
          synthPulse *= 0.9;
          return synthPulse;
        }
        if (useCustom && analyser && freqBins) {
          analyser.getByteFrequencyData(freqBins);
          let sum = 0;
          const len = Math.min(32, freqBins.length);
          for (let i = 0; i < len; i++) sum += freqBins[i];
          return Math.min(1.0, (sum / (len * 255)) * 1.45);
        }
        synthPulse *= 0.93;
        return synthPulse;
      }
    };
  }

  return { create };
})();
