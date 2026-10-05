import { pct, type Slice } from './types';

export interface PieImage {
  dataUrl: string;
  /** Display size in px (the bitmap is drawn at 2x for sharp print). */
  width: number;
  height: number;
}

const W = 560;
const H = 300;
const SCALE = 2;
const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#898781';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Draws a labelled donut to a PNG for the Excel / PDF exports, which can't host
 * the live Recharts SVG. Every slice is listed with its count and share, so
 * colour never carries the meaning alone.
 */
export function renderPie(title: string, slices: Slice[], centerCaption = 'total'): PieImage {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = INK;
  ctx.font = `600 15px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 18, 28);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = 130;
  const cy = 168;
  const outer = 104;
  const inner = 62;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = '#e1e0d9';
    ctx.fill('evenodd');
  } else {
    let a = -Math.PI / 2;
    for (const s of slices) {
      if (s.value <= 0) continue;
      const sweep = (s.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, a, a + sweep);
      ctx.arc(cx, cy, inner, a + sweep, a, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      // 2px surface gap between segments.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      a += sweep;
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(String(total), cx, cy + 6);
  ctx.fillStyle = MUTED;
  ctx.font = `500 11px ${FONT}`;
  ctx.fillText(centerCaption, cx, cy + 24);

  // Legend: swatch · label · count · share.
  ctx.textAlign = 'left';
  const lx = 268;
  const rowH = 30;
  let ly = cy - ((slices.length - 1) * rowH) / 2;
  for (const s of slices) {
    ctx.fillStyle = s.color;
    roundRect(ctx, lx, ly - 7, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText(truncate(ctx, s.label, 150), lx + 22, ly + 4);
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(String(s.value), W - 76, ly + 4);
    ctx.fillStyle = INK_2;
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText(pct(s.value, total), W - 18, ly + 4);
    ctx.textAlign = 'left';
    ly += rowH;
  }

  return { dataUrl: canvas.toDataURL('image/png'), width: W, height: H };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
