import { Rectangle, Texture } from "pixi.js";

const PAGE_SIZE = 1024;
const SHELL_SIZE = 128;
const SHELL_DIAMETER = 100;
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function canvas(size: number) {
  const element = document.createElement("canvas");
  element.width = element.height = size;
  const context = element.getContext("2d");
  if (!context) throw new Error("구슬 디자인을 그릴 수 없습니다.");
  return { element, context };
}
function shade(color: number, target: number, amount: number) {
  const channels = [16, 8, 0].map((shift) => {
    const base = (color >> shift) & 255;
    return Math.round(base + (((target >> shift) & 255) - base) * amount);
  });
  return `rgb(${channels.join(",")})`;
}
function glassShell(color: number) {
  const { element, context: ctx } = canvas(SHELL_SIZE);
  // Shadow, lacquer depth and reflected light are visual only: radius stays 0.22.
  ctx.save();
  ctx.translate(66, 111);
  ctx.scale(1, 0.3);
  const shadow = ctx.createRadialGradient(0, 0, 8, 0, 0, 49);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.arc(0, 0, 49, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const body = ctx.createRadialGradient(44, 35, 4, 68, 68, 65);
  body.addColorStop(0, shade(color, 0xffffff, 0.85));
  body.addColorStop(0.27, shade(color, 0xffffff, 0.36));
  body.addColorStop(0.56, shade(color, 0xffffff, 0.04));
  body.addColorStop(0.82, shade(color, 0x08101f, 0.38));
  body.addColorStop(1, shade(color, 0x08101f, 0.82));
  ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  const rim = ctx.createLinearGradient(25, 19, 102, 112);
  rim.addColorStop(0, "rgba(255,255,255,0.92)");
  rim.addColorStop(0.4, "rgba(255,255,255,0.12)");
  rim.addColorStop(0.8, "rgba(255,255,255,0.04)");
  rim.addColorStop(1, shade(color, 0xffffff, 0.65));
  ctx.strokeStyle = rim; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(64, 64, 48.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath(); ctx.ellipse(44, 32, 22, 9, -0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath(); ctx.ellipse(37, 31, 7, 4, -0.55, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(64, 65, 39, 0.7, 1.65); ctx.stroke();
  ctx.restore();
  return Texture.from(element);
}

/** Owns shared glass skins and an atlas of actual participant engravings. */
export class MarbleArt {
  readonly shells: readonly Texture[];
  readonly shellScale: number;
  readonly engravingScale: number;
  private readonly cellSize: number;
  private readonly columns: number;
  private readonly glyphs = new Map<string, Texture>();
  private readonly pages: { context: CanvasRenderingContext2D; texture: Texture; used: number }[] = [];

  constructor(colors: readonly number[], count: number, diameter: number) {
    this.shells = colors.map(glassShell);
    this.shellScale = diameter / SHELL_DIAMETER;
    this.cellSize = count <= 300 ? 96 : 48;
    this.columns = Math.floor(PAGE_SIZE / this.cellSize);
    this.engravingScale = diameter * 0.9 / this.cellSize;
  }
  prepareNames(names: readonly string[]) {
    const unique = new Set(names);
    const additions = [...unique].filter((name) => !this.glyphs.has(name)).length;
    // Repeated live edits cannot retain an unbounded collection of old glyphs.
    if (this.glyphs.size + additions > unique.size + 128) this.clearEngravings();
    const changedPages = new Set<Texture>();
    for (const name of unique) {
      if (this.glyphs.has(name)) continue;
      let page = this.pages.at(-1);
      if (!page || page.used === this.columns * this.columns) {
        const { element, context } = canvas(PAGE_SIZE);
        page = { context, texture: Texture.from(element), used: 0 };
        this.pages.push(page);
      }
      const slot = page.used++;
      const x = (slot % this.columns) * this.cellSize;
      const y = Math.floor(slot / this.columns) * this.cellSize;
      this.drawEngraving(page.context, name, x, y);
      const texture = new Texture({ source: page.texture.source,
        frame: new Rectangle(x, y, this.cellSize, this.cellSize) });
      this.glyphs.set(name, texture);
      changedPages.add(page.texture);
    }
    for (const page of changedPages) page.source.update();
    return names.map((name) => this.glyphs.get(name)!);
  }
  private drawEngraving(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
    const letters = Array.from(name);
    const lineLength = letters.length <= 6 ? letters.length : Math.ceil(letters.length / Math.ceil(letters.length / 6));
    const lines: string[] = [];
    for (let i = 0; i < letters.length; i += Math.max(1, lineLength))
      lines.push(letters.slice(i, i + lineLength).join(""));
    if (!lines.length) return;
    const size = this.cellSize;
    let fontSize = size * (lines.length === 1 ? 0.55 : 0.68 / lines.length);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y + 1, size - 2, size - 2); ctx.clip();
    ctx.font = `900 ${fontSize}px ${FONT}`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    fontSize *= Math.min(1, size * 0.86 / Math.max(1, widest));
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lineHeight = fontSize * 1.14;
    for (const [index, line] of lines.entries()) {
      const cy = y + size / 2 + (index - (lines.length - 1) / 2) * lineHeight;
      // A bright lower bevel around deep ink reads as an inset inscription.
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, size / 55);
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.strokeText(line, x + size / 2, cy + size / 80);
      ctx.fillStyle = "rgba(10,18,34,0.94)";
      ctx.fillText(line, x + size / 2, cy);
    }
    ctx.restore();
  }
  private clearEngravings() {
    for (const texture of this.glyphs.values()) texture.destroy(false);
    for (const page of this.pages) page.texture.destroy(true);
    this.glyphs.clear();
    this.pages.length = 0;
  }
  dispose() {
    this.clearEngravings();
    for (const shell of this.shells) shell.destroy(true);
  }
}
