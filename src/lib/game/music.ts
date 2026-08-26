// Synthesized background music for the TV console (fun pass, 2026-08-24;
// smoothness pass, 2026-08-26). Kahoot's groovy-timer-music is half its
// energy, but bundling recorded tracks means licensing. So the console
// SYNTHESIZES its soundtrack with the Web Audio API: zero assets, zero
// rights questions, a few kilobytes of code.
//
// Architecture: every mode builds a SCENE behind its own gain node, and mode
// changes CROSSFADE (new scene ramps in over ~1.2s while the old one ramps
// out) instead of hard-cutting oscillators. Reveal keeps a low bed running
// under its sting so standings never play to dead air.
//
// Opt-in per venue (settings.music_enabled); 'm' on the console mutes live.
// Everything routes through one master gain kept deliberately low: this is
// bar wallpaper, not a rave. Browsers require a user gesture before audio;
// resume() is called from the console's existing key/click handlers.

export type MusicMode = "off" | "lobby" | "question" | "urgent" | "reveal" | "podium";

const FADE_IN_S = 1.2;
const FADE_OUT_S = 1.0;

const CHORDS: Record<string, number[][]> = {
  // Frequencies in Hz. Lobby: warm, unhurried ii-V drift. Question: minor and
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
  question: { bpm: 112, root: 110 },
  urgent: { bpm: 156, root: 130.81 },
  podium: { bpm: 128, root: 130.81 },
};

// One mode's running sound: everything hangs off `out`, so a scene fades as
// one unit and its timers die together.
interface Scene {
  out: GainNode;
  timers: number[];
  oscs: OscillatorNode[];
}

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private scene: Scene | null = null;
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
    this.fadeOutScene();
    if (mode === "off") return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.resume();

    const scene: Scene = { out: ctx.createGain(), timers: [], oscs: [] };
    scene.out.gain.value = 0;
    scene.out.connect(this.master);
    scene.out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_IN_S);
    this.scene = scene;

    if (mode === "reveal") {
      // The sting announces the answer; the bed keeps breathing underneath so
      // the standings that follow never sit in silence.
      this.sting(ctx, scene);
      this.pad(ctx, scene, CHORDS.lobby, 0.32, 1400);
      return;
    }
    this.pad(ctx, scene, CHORDS[mode], 0.5, 900);
    this.pulse(ctx, scene, PULSE[mode]);
    if (mode === "podium") this.arp(ctx, scene, [523.25, 659.25, 783.99, 1046.5]);
  }

  // Ramp the outgoing scene to silence, then stop its sources — the ear hears
  // a handoff, never a cut.
  private fadeOutScene(): void {
    const old = this.scene;
    this.scene = null;
    if (!old || !this.ctx) return;
    const t = this.ctx.currentTime;
    old.out.gain.cancelScheduledValues(t);
    old.out.gain.setValueAtTime(old.out.gain.value, t);
    old.out.gain.linearRampToValueAtTime(0, t + FADE_OUT_S);
    for (const id of old.timers) clearInterval(id);
    setTimeout(() => {
      for (const o of old.oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      old.out.disconnect();
    }, (FADE_OUT_S + 0.3) * 1000);
  }

  // Slow detuned-saw chord through a lowpass: the bed everything sits on.
  private pad(ctx: AudioContext, scene: Scene, chords: number[][], level: number, cutoffHz: number): void {
    const gain = ctx.createGain();
    gain.gain.value = level;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoffHz;
    filter.Q.value = 0.4;
    gain.connect(filter).connect(scene.out);

    let bar = 0;
    const oscs: OscillatorNode[] = [];
    const setChord = (freqs: number[]) => {
      oscs.forEach((o, i) => {
        const f = freqs[i % freqs.length];
        // Slow glide between chords: movement without steps.
        o.frequency.setTargetAtTime(f * (i >= freqs.length ? 0.5 : 1), ctx.currentTime, 0.55);
      });
    };
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = i % 2 === 0 ? -5 : 5;
      o.connect(gain);
      o.start();
      oscs.push(o);
      scene.oscs.push(o);
    }
    setChord(chords[0]);
    const id = window.setInterval(() => {
      bar = (bar + 1) % chords.length;
      setChord(chords[bar]);
    }, 4800);
    scene.timers.push(id);
  }

  // The heartbeat: a soft bass swell on the beat, a brushed tick off-beat.
  // Every hit gets a real attack ramp — the old zero-attack blips are the
  // "jagged" the owner heard.
  private pulse(ctx: AudioContext, scene: Scene, cfg: { bpm: number; root: number }): void {
    const beatMs = 60_000 / cfg.bpm;
    let step = 0;
    const id = window.setInterval(() => {
      const t = ctx.currentTime;
      if (step % 2 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = cfg.root;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.65, t + 0.035);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(scene.out);
        o.start(t);
        o.stop(t + 0.32);
      } else {
        const len = 0.03;
        const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.14, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 6500;
        src.connect(hp).connect(g).connect(scene.out);
        src.start(t);
      }
      step++;
    }, beatMs / 2);
    scene.timers.push(id);
  }

  // Podium sparkle: a rising arpeggio loop over the pad.
  private arp(ctx: AudioContext, scene: Scene, notes: number[]): void {
    let i = 0;
    const id = window.setInterval(() => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(scene.out);
      o.start(t);
      o.stop(t + 0.46);
      i++;
    }, 230);
    scene.timers.push(id);
  }

  // The reveal sting: three soft chimes with real attacks, into the scene so
  // it rides the same fade as its bed.
  private sting(ctx: AudioContext, scene: Scene): void {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(scene.out);
      o.start(t);
      o.stop(t + 0.65);
      scene.oscs.push(o);
    });
  }
}

export const music = new MusicEngine();
