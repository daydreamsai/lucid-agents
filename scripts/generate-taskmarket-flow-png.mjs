#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const WIDTH = 1600;
const HEIGHT = 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(repoRoot, "docs/assets/taskmarket-flow.png");

const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

const COLORS = {
  bg: [247, 250, 255, 255],
  grid: [232, 238, 248, 255],
  card: [255, 255, 255, 255],
  border: [214, 224, 240, 255],
  title: [29, 45, 74, 255],
  text: [63, 81, 116, 255],
  white: [255, 255, 255, 255],
  arrow: [73, 107, 171, 255],
  shadow: [53, 72, 113, 44],
  accent1: [69, 120, 255, 255],
  accent2: [83, 186, 144, 255],
  accent3: [255, 170, 71, 255],
  accent4: [178, 109, 250, 255],
  accent5: [18, 143, 208, 255],
  badge: [18, 36, 74, 255]
};

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
}

function setPixel(x, y, color) {
  if (!inBounds(x, y)) return;
  const xi = x | 0;
  const yi = y | 0;
  const idx = (yi * WIDTH + xi) * 4;
  const [r, g, b, a] = color;

  if (a === 255) {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
    return;
  }

  const alpha = a / 255;
  const inv = 1 - alpha;
  pixels[idx] = Math.round(r * alpha + pixels[idx] * inv);
  pixels[idx + 1] = Math.round(g * alpha + pixels[idx + 1] * inv);
  pixels[idx + 2] = Math.round(b * alpha + pixels[idx + 2] * inv);
  pixels[idx + 3] = 255;
}

function fillRect(x, y, w, h, color) {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(WIDTH, (x + w) | 0);
  const y1 = Math.min(HEIGHT, (y + h) | 0);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) setPixel(px, py, color);
  }
}

function pointInRoundedRect(px, py, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  const rx = px < x + rr ? x + rr : px > x + w - rr - 1 ? x + w - rr - 1 : px;
  const ry = py < y + rr ? y + rr : py > y + h - rr - 1 ? y + h - rr - 1 : py;
  const dx = px - rx;
  const dy = py - ry;
  return dx * dx + dy * dy <= rr * rr;
}

function drawRoundedRect(x, y, w, h, r, fillColor, strokeColor = null, strokeWidth = 0) {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(WIDTH, (x + w) | 0);
  const y1 = Math.min(HEIGHT, (y + h) | 0);

  if (fillColor) {
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (pointInRoundedRect(px, py, x, y, w, h, r)) setPixel(px, py, fillColor);
      }
    }
  }

  if (strokeColor && strokeWidth > 0) {
    const ix = x + strokeWidth;
    const iy = y + strokeWidth;
    const iw = w - strokeWidth * 2;
    const ih = h - strokeWidth * 2;
    const ir = Math.max(0, r - strokeWidth);

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const inOuter = pointInRoundedRect(px, py, x, y, w, h, r);
        if (!inOuter) continue;
        const inInner = iw > 0 && ih > 0 ? pointInRoundedRect(px, py, ix, iy, iw, ih, ir) : false;
        if (!inInner) setPixel(px, py, strokeColor);
      }
    }
  }
}

function drawFilledCircle(cx, cy, radius, color) {
  const r = radius | 0;
  const x0 = Math.max(0, (cx - r) | 0);
  const y0 = Math.max(0, (cy - r) | 0);
  const x1 = Math.min(WIDTH - 1, (cx + r) | 0);
  const y1 = Math.min(HEIGHT - 1, (cy + r) | 0);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(x, y, color);
    }
  }
}

function drawCircleStroke(cx, cy, radius, color, stroke = 2) {
  const rOut = radius;
  const rIn = Math.max(0, radius - stroke);
  const x0 = Math.max(0, (cx - rOut) | 0);
  const y0 = Math.max(0, (cy - rOut) | 0);
  const x1 = Math.min(WIDTH - 1, (cx + rOut) | 0);
  const y1 = Math.min(HEIGHT - 1, (cy + rOut) | 0);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rOut * rOut && d2 >= rIn * rIn) setPixel(x, y, color);
    }
  }
}

function drawLine(x1, y1, x2, y2, color, thickness = 2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const radius = Math.max(1, Math.floor(thickness / 2));

  if (steps === 0) {
    drawFilledCircle(x1, y1, radius, color);
    return;
  }

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    drawFilledCircle(x, y, radius, color);
  }
}

function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function fillTriangle(x1, y1, x2, y2, x3, y3, color) {
  const minX = Math.floor(Math.min(x1, x2, x3));
  const maxX = Math.ceil(Math.max(x1, x2, x3));
  const minY = Math.floor(Math.min(y1, y2, y3));
  const maxY = Math.ceil(Math.max(y1, y2, y3));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInTriangle(x + 0.5, y + 0.5, x1, y1, x2, y2, x3, y3)) setPixel(x, y, color);
    }
  }
}

function drawArrow(x1, y1, x2, y2, color, thickness = 5, headLength = 18) {
  drawLine(x1, y1, x2, y2, color, thickness);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = headLength * 0.62;
  const bx = x2 - headLength * Math.cos(angle);
  const by = y2 - headLength * Math.sin(angle);
  const x3 = bx + wing * Math.cos(angle + Math.PI / 2);
  const y3 = by + wing * Math.sin(angle + Math.PI / 2);
  const x4 = bx + wing * Math.cos(angle - Math.PI / 2);
  const y4 = by + wing * Math.sin(angle - Math.PI / 2);
  fillTriangle(x2, y2, x3, y3, x4, y4, color);
}

const FONT = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["#####", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["#####", "....#", "...#.", "..##.", "....#", "#...#", ".###."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: [".###.", "#...#", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "#...#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ":": [".....", "..##.", "..##.", ".....", "..##.", "..##.", "....."],
  "/": ["....#", "...#.", "..#..", ".#...", "#....", ".....", "....."],
  "?": [".###.", "#...#", "...#.", "..#..", "..#..", ".....", "..#.."]
};

function glyphFor(ch) {
  if (FONT[ch]) return FONT[ch];
  const up = ch.toUpperCase();
  if (FONT[up]) return FONT[up];
  return FONT["?"];
}

function measureText(text, scale = 1, spacing = 1) {
  if (!text || text.length === 0) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += glyphFor(text[i])[0].length * scale;
    if (i < text.length - 1) width += spacing * scale;
  }
  return width;
}

function drawChar(ch, x, y, scale, color) {
  const glyph = glyphFor(ch);
  for (let gy = 0; gy < glyph.length; gy++) {
    const row = glyph[gy];
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== "#") continue;
      fillRect(x + gx * scale, y + gy * scale, scale, scale, color);
    }
  }
}

function drawText(text, x, y, options = {}) {
  const scale = options.scale ?? 2;
  const spacing = options.spacing ?? 1;
  const color = options.color ?? COLORS.text;
  const align = options.align ?? "left";
  const width = measureText(text, scale, spacing);

  let startX = x;
  if (align === "center") startX = Math.round(x - width / 2);
  if (align === "right") startX = x - width;

  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    drawChar(ch, cx, y, scale, color);
    cx += glyphFor(ch)[0].length * scale;
    if (i < text.length - 1) cx += spacing * scale;
  }
}

function wrapText(text, maxWidth, scale = 2, spacing = 1) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, scale, spacing) <= maxWidth || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(text, x, y, maxWidth, options = {}) {
  const scale = options.scale ?? 2;
  const color = options.color ?? COLORS.text;
  const align = options.align ?? "left";
  const lineGap = options.lineGap ?? 2;
  const maxLines = options.maxLines ?? Infinity;
  const spacing = options.spacing ?? 1;

  const lines = wrapText(text, maxWidth, scale, spacing).slice(0, maxLines);
  const lineHeight = 7 * scale + lineGap;

  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * lineHeight, { scale, color, align, spacing });
  }

  return lines.length * lineHeight;
}

function drawCard({
  x,
  y,
  w,
  h,
  step,
  title,
  body,
  accent
}) {
  drawRoundedRect(x + 8, y + 10, w, h, 18, COLORS.shadow, null, 0);
  drawRoundedRect(x, y, w, h, 18, COLORS.card, COLORS.border, 2);
  drawRoundedRect(x, y, w, 16, 18, accent, null, 0);

  const bubbleX = x + 36;
  const bubbleY = y + 42;
  drawFilledCircle(bubbleX, bubbleY, 17, accent);
  drawCircleStroke(bubbleX, bubbleY, 17, COLORS.white, 2);
  drawText(String(step), bubbleX, bubbleY - 10, {
    scale: 3,
    align: "center",
    color: COLORS.white
  });

  drawWrappedText(title, x + 66, y + 22, w - 84, {
    scale: 3,
    color: COLORS.title,
    maxLines: 3
  });

  drawWrappedText(body, x + 24, y + 110, w - 48, {
    scale: 3,
    color: COLORS.text,
    maxLines: 4
  });
}

function drawBackground() {
  fillRect(0, 0, WIDTH, HEIGHT, COLORS.bg);

  for (let y = 180; y < HEIGHT; y += 32) {
    for (let x = 26; x < WIDTH; x += 32) {
      drawFilledCircle(x, y, 1, COLORS.grid);
    }
  }

  drawFilledCircle(130, 120, 60, [231, 239, 255, 255]);
  drawFilledCircle(1470, 900, 100, [235, 245, 255, 255]);
}

function drawHeader() {
  drawText("TASKMARKET", WIDTH / 2, 54, {
    scale: 8,
    align: "center",
    color: COLORS.title
  });
  drawText("END-TO-END FLOW", WIDTH / 2, 130, {
    scale: 5,
    align: "center",
    color: COLORS.text
  });

  drawRoundedRect(1198, 40, 334, 74, 16, COLORS.badge, null, 0);
  drawText("taskmarket.xyz", 1365, 64, {
    scale: 4,
    align: "center",
    color: COLORS.white
  });
}

function drawFlow() {
  const cardW = 300;
  const cardH = 220;
  const y = 250;
  const xs = [140, 480, 820, 1160];

  drawCard({
    x: xs[0],
    y,
    w: cardW,
    h: cardH,
    step: 1,
    title: "REQUESTER POSTS TASK",
    body: "+ ESCROWED USDC REWARD",
    accent: COLORS.accent1
  });

  drawCard({
    x: xs[1],
    y,
    w: cardW,
    h: cardH,
    step: 2,
    title: "WORKER PICKS UP TASK",
    body: "STARTS WORK",
    accent: COLORS.accent2
  });

  drawCard({
    x: xs[2],
    y,
    w: cardW,
    h: cardH,
    step: 3,
    title: "WORKER SUBMITS COMPLETED WORK",
    body: "DELIVERS RESULT",
    accent: COLORS.accent3
  });

  drawCard({
    x: xs[3],
    y,
    w: cardW,
    h: cardH,
    step: 4,
    title: "REQUESTER ACCEPTS",
    body: "USDC RELEASED TO WORKER",
    accent: COLORS.accent4
  });

  drawArrow(xs[0] + cardW + 8, y + 110, xs[1] - 10, y + 110, COLORS.arrow, 6, 16);
  drawArrow(xs[1] + cardW + 8, y + 110, xs[2] - 10, y + 110, COLORS.arrow, 6, 16);
  drawArrow(xs[2] + cardW + 8, y + 110, xs[3] - 10, y + 110, COLORS.arrow, 6, 16);

  const s5x = 280;
  const s5y = 620;
  const s5w = 1040;
  const s5h = 220;

  drawArrow(xs[3] + cardW / 2, y + cardH + 8, xs[3] + cardW / 2, s5y - 12, COLORS.arrow, 6, 18);

  drawRoundedRect(s5x + 10, s5y + 12, s5w, s5h, 20, COLORS.shadow, null, 0);
  drawRoundedRect(s5x, s5y, s5w, s5h, 20, COLORS.card, COLORS.border, 2);
  drawRoundedRect(s5x, s5y, s5w, 18, 20, COLORS.accent5, null, 0);

  drawFilledCircle(s5x + 52, s5y + 56, 22, COLORS.accent5);
  drawCircleStroke(s5x + 52, s5y + 56, 22, COLORS.white, 2);
  drawText("5", s5x + 52, s5y + 43, {
    scale: 4,
    align: "center",
    color: COLORS.white
  });

  drawWrappedText("ALL PAYMENTS TRUSTLESS VIA x402 ON BASE", s5x + 90, s5y + 35, s5w - 120, {
    scale: 4,
    color: COLORS.title,
    maxLines: 2
  });

  drawWrappedText("SETTLEMENT IS ONCHAIN AND NON-CUSTODIAL", s5x + 40, s5y + 122, s5w - 80, {
    scale: 3,
    color: COLORS.text,
    align: "center"
  });

  drawText("REQUESTER  ->  TASKMARKET  ->  WORKER", WIDTH / 2, 900, {
    scale: 3,
    align: "center",
    color: COLORS.text
  });
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    const srcOffset = y * stride;
    for (let i = 0; i < stride; i++) {
      raw[rawOffset + 1 + i] = rgba[srcOffset + i];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ];

  return Buffer.concat([signature, ...chunks]);
}

function render() {
  drawBackground();
  drawHeader();
  drawFlow();

  const png = encodePNG(WIDTH, HEIGHT, pixels);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);

  process.stdout.write(`Generated ${outputPath} (${WIDTH}x${HEIGHT})\n`);
}

render();