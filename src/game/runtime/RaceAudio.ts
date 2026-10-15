/** Optional synthesized cues. No downloads, autoplay, timer or extra animation loop. */
export class RaceAudio {
  private context: AudioContext | null = null;
  private disposed = false;
  private puffBuffer: AudioBuffer | null = null;
  enabled = false;
  async toggle() {
    if (this.disposed) return;
    if (this.enabled) { this.enabled = false; await this.context?.suspend().catch(() => {}); return; }
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.enabled = !this.disposed && this.context.state === "running";
    } catch { this.enabled = false; }
  }
  cue(kind: "count" | "go" | "lead" | "win") {
    if (!this.enabled || this.context?.state !== "running") return;
    const context = this.context;
    const notes = kind === "win" ? [523, 659, 784, 1047] : kind === "go" ? [880] : kind === "lead" ? [440, 660] : [440];
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + i * 0.1;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.07, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + 0.24);
    });
  }
  puff(strong = false) {
    if (!this.enabled || this.context?.state !== "running") return;
    const context = this.context, at = context.currentTime;
    const duration = strong ? 0.25 : 0.19;
    if (!this.puffBuffer) {
      this.puffBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.25), context.sampleRate);
      const samples = this.puffBuffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 0x80000000 - 1;
      }
    }
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.puffBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(strong ? 2200 : 1800, at);
    filter.frequency.exponentialRampToValueAtTime(450, at + duration - 0.01);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(strong ? 0.2 : 0.15, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration - 0.01);
    source.connect(filter).connect(gain).connect(context.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(at);
    source.stop(at + duration);
  }
  dispose() {
    this.disposed = true;
    this.enabled = false;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.puffBuffer = null;
  }
}
