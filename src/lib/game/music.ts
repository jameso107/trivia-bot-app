// Synthesized background music for the TV console (fun pass, 2026-08-24).
// Kahoot's groovy-timer-music is half its energy — but bundling recorded
// tracks means licensing. So the console SYNTHESIZES its soundtrack with the
// Web Audio API: zero assets, zero rights questions, a few kilobytes of code.
//
// Opt-in per venue (settings.music_enabled); 'm' on the console mutes live.
// Everything routes through one master gain kept deliberately low — this is
// bar wallpaper, not a rave. Browsers require a user gesture before audio;
// resume() is called from the console's existing key/click handlers.

export type MusicMode = "off" | "lobby" | "question" | "urgent" | "reveal" | "podium";

interface Voice {
  stop: () => void;
}

const CHORDS: Record<string, number[][]> = {
  // Frequencies in Hz. Lobby: warm, unhurried ii–V drift. Question: minor and
  // focused. Urgent: same, up a minor third. Podium: major and proud.
  lobby: [
    [220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
  ],
  question: [
    [220.0, 261.63, 311.13],
    [207.65, 246.94, 311.13],
  ],
  urgent: [
    [261.63, 311.13, 369.99],
    [246.94, 293.66, 369.99],
  ],
  podium: [
    [261.63, 329.63, 392.0],
    [349.23, 440.0, 523.25],
  ],
};

const PULSE: Record<string, { bpm: number; root: number }> = {
  lobby: { bpm: 84, root: 110 },
  question: { bpm: 116, root: 110 },
  urgent: { bpm: 164, root: 130.81 },
  podium: { bpm: 132, root: 130.81 },
};

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private mode: MusicMode = "off";
  private muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.07;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // Call from any user-gesture handler; autoplay policies need one.
  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.07, this.ctx.currentTime, 0.1);
    }
  }
  isMuted(): boolean {
    return this.muted;
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.teardown();
    if (mode === "off") return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.resume();
    if (mode === "reveal") {
      this.sting(ctx);
      return;
    }
    this.pad(ctx, CHORDS[mode]);
    this.pulse(ctx, PULSE[mode]);
    if (mode === "podium") this.arp(ctx, [523.25, 659.25, 783.99, 1046.5]);
  }

  private teardown(): void {
    for (const v of this.voices) v.stop();
    this.voices = [];
  }

  // Slow detuned-saw chord through a lowpass — the bed everything sits on.
  private pad(ctx: AudioContext, chords: number[][]): void {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    gain.connect(filter).connect(this.master!);

    let bar = 0;
    const oscs: OscillatorNode[] = [];
    const setChord = (freqs: number[]) => {
      oscs.forEach((o, i) => {
        const f = freqs[i % freqs.length];
        o.frequency.setTargetAtTime(f * (i >= freqs.length ? 0.5 : 1), ctx.currentTime, 0.3);
      });
    };
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = i % 2 === 0 ? -6 : 6;
      o.connect(gain);
      o.start();
      oscs.push(o);
    }
    setChord(chords[0]);
    const id = setInterval(() => {
      bar = (bar + 1) % chords.length;
      setChord(chords[bar]);
    }, 4800);
    this.voices.push({
      stop: () => {
        clearInterval(id);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => oscs.forEach((o) => o.stop()), 900);
      },
    });
  }

  // The heartbeat: a soft bass blip on the beat, a tick on the off-beat.
  private pulse(ctx: AudioContext, cfg: { bpm: number; root: number }): void {
    const beatMs = 60_000 / cfg.bpm;
    let step = 0;
    const id = setInterval(() => {
      const t = ctx.currentTime;
      if (step % 2 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = cfg.root;
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(this.master!);
        o.start(t);
        o.stop(t + 0.25);
      } else {
        const len = 0.03;
        const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.25;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 6000;
        src.connect(hp).connect(g).connect(this.master!);
        src.start(t);
      }
      step++;
    }, beatMs / 2);
    this.voices.push({ stop: () => clearInterval(id) });
  }

  // Podium sparkle: a rising arpeggio loop over the pad.
  private arp(ctx: AudioContext, notes: number[]): void {
    let i = 0;
    const id = setInterval(() => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.45);
      i++;
    }, 220);
    this.voices.push({ stop: () => clearInterval(id) });
  }

  // One-shot reveal sting, then silence (the host line owns the moment).
  private sting(ctx: AudioContext): void {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.55);
    });
  }
}

export const music = new MusicEngine();
