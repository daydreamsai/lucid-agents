#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const WIDTH = 1600;
const HEIGHT = 1000;
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4, 0);

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "?": ["01110", "10001", "00010", "00100", "00100", "00000", "00100"],

  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],

  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setPixel(x, y, r, g, b, a = 255) {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= WIDTH || yi >= HEIGHT) return;
  const idx = (yi * WIDTH + xi) * 4;
  if (a >= 255) {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
    return;
  }
  if (a <= 0) return;

  const inv = 255 - a;
  pixels[idx] = ((r * a + pixels[idx] * inv) / 255) | 0;
  pixels[idx + 1] = ((g * a + pixels[idx + 1] * inv) / 255) | 0;
  pixels[idx + 2] = ((b * a + pixels[idx + 2] * inv) / 255) | 0;
  pixels[idx + 3] = 255;
}

function fillRect(x, y, w, h, color, alpha = 255) {
  const [r, g, b] = hexToRgb(color);
  const x0 = clamp(Math.floor(x), 0, WIDTH);
  const y0 = clamp(Math.floor(y), 0, HEIGHT);
  const x1 = clamp(Math.ceil(x + w), 0, WIDTH);
  const y1 = clamp(Math.ceil(y + h), 0, HEIGHT);

  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      setPixel(xx, yy, r, g, b, alpha);
    }
  }
}

function fillRoundedRect(x, y, w, h, radius, color, alpha = 255) {
  const [r, g, b] = hexToRgb(color);
  const rr = Math.max(0, Math.min(radius, Math.floor(Math.min(w, h) / 2)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);

  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const cx = xx < x + rr ? x + rr : xx > x + w - rr - 1 ? x + w - rr - 1 : xx;
      const cy = yy < y + rr ? y + rr : yy > y + h - rr - 1 ? y + h - rr - 1 : yy;
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= rr * rr) {
        setPixel(xx, yy, r, g, b, alpha);
      }
    }
  }
}

function fillCircle(cx, cy, radius, color, alpha = 255) {
  const [r, g, b] = hexToRgb(color);
  const rr = radius * radius;
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);

  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= rr) {
        setPixel(xx, yy, r, g, b, alpha);
      }
    }
  }
}

function drawLine(x0, y0, x1, y1, thickness, color, alpha = 255) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (steps === 0) {
    fillCircle(x0, y0, thickness / 2, color, alpha);
    return;
  }
  const radius = Math.max(1, thickness / 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillCircle(x, y, radius, color, alpha);
  }
}

function fillTriangle(p1, p2, p3, color, alpha = 255) {
  const [r, g, b] = hexToRgb(color);

  const minX = Math.floor(Math.min(p1.x, p2.x, p3.x));
  const maxX = Math.ceil(Math.max(p1.x, p2.x, p3.x));
  const minY = Math.floor(Math.min(p1.y, p2.y, p3.y));
  const maxY = Math.ceil(Math.max(p1.y, p2.y, p3.y));

  const edge = (a, b, p) => (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p = { x: x + 0.5, y: y + 0.5 };
      const w0 = edge(p2, p3, p);
      const w1 = edge(p3, p1, p);
      const w2 = edge(p1, p2, p);
      const hasNeg = w0 < 0 || w1 < 0 || w2 < 0;
      const hasPos = w0 > 0 || w1 > 0 || w2 > 0;
      if (!(hasNeg && hasPos)) {
        setPixel(x, y, r, g, b, alpha);
      }
    }
  }
}

function drawArrow(x0, y0, x1, y1, color) {
  drawLine(x0, y0, x1, y1, 6, color, 255);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const len = 18;
  const p1 = { x: x1, y: y1 };
  const p2 = {
    x: x1 - len * Math.cos(angle - Math.PI / 7),
    y: y1 - len * Math.sin(angle - Math.PI / 7),
  };
  const p3 = {
    x: x1 - len * Math.cos(angle + Math.PI / 7),
    y: y1 - len * Math.sin(angle + Math.PI / 7),
  };
  fillTriangle(p1, p2, p3, color, 255);
}

function drawGlyph(ch, x, y, scale, color) {
  const key = ch.toUpperCase();
  const glyph = FONT[key] ?? FONT["?"];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (glyph[row][col] === "1") {
        fillRect(x + col * scale, y + row * scale, scale, scale, color, 255);
      }
    }
  }
}

function measureText(text, scale) {
  if (!text || text.length === 0) return 0;
  return text.length * 5 * scale + (text.length - 1) * scale;
}

function drawText(text, x, y, scale, color, align = "left") {
  const t = String(text).toUpperCase();
  const width = measureText(t, scale);
  let cursorX = x;
  if (align === "center") cursorX = x - Math.floor(width / 2);
  if (align === "right") cursorX = x - width;

  for (let i = 0; i < t.length; i += 1) {
    drawGlyph(t[i], cursorX, y, scale, color);
    cursorX += 6 * scale;
  }
}

function wrapText(text, maxWidth, scale) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current.length > 0 ? `${current} ${word}` : word;
    if (measureText(test, scale) <= maxWidth) {
      current = test;
    } else {
      if (current.length > 0) lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

function drawWrappedCenteredText(text, centerX, topY, maxWidth, scale, color, boxHeight) {
  const lines = wrapText(text, maxWidth, scale);
  const lineHeight = 8 * scale;
  const totalHeight = lines.length * lineHeight;
  let y = topY + Math.floor((boxHeight - totalHeight) / 2);

  for (const line of lines) {
    drawText(line, centerX, y, scale, color, "center");
    y += lineHeight;
  }
}

function drawVerticalGradient(topHex, bottomHex) {
  const [tr, tg, tb] = hexToRgb(topHex);
  const [br, bg, bb] = hexToRgb(bottomHex);

  for (let y = 0; y < HEIGHT; y += 1) {
    const t = y / (HEIGHT - 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    for (let x = 0; x < WIDTH; x += 1) {
      setPixel(x, y, r, g, b, 255);
    }
  }
}

function drawGlow(cx, cy, radius, color, maxAlpha) {
  const [r, g, b] = hexToRgb(color);
  const rr = radius * radius;
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rr) {
        const t = 1 - d2 / rr;
        setPixel(x, y, r, g, b, Math.round(maxAlpha * t));
      }
    }
  }
}

function drawBadge(cx, cy, text, bg, fg) {
  const scale = 3;
  const paddingX = 22;
  const h = 44;
  const w = measureText(text, scale) + paddingX * 2;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  fillRoundedRect(x, y, w, h, 22, bg, 255);
  drawText(text, cx, y + 11, scale, fg, "center");
}

function createPngBuffer(width, height, rgbaPixels) {
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawRow = y * (rowLength + 1);
    raw[rawRow] = 0;
    rgbaPixels.copy(raw, rawRow + 1, y * rowLength, y * rowLength + rowLength);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ];

  return Buffer.concat([pngSig, ...chunks]);
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function render() {
  drawVerticalGradient("#F7FAFF", "#EEF2FF");
  drawGlow(1300, 120, 420, "#C7D2FE", 70);
  drawGlow(260, 880, 360, "#A5F3FC", 55);

  drawText("TASKMARKET", WIDTH / 2, 46, 8, "#0F172A", "center");
  drawText("END TO END FLOW", WIDTH / 2, 124, 6, "#334155", "center");

  const card = { x: 120, y: 170, w: 1360, h: 700, r: 30 };
  fillRoundedRect(card.x + 8, card.y + 12, card.w, card.h, card.r, "#94A3B8", 40);
  fillRoundedRect(card.x, card.y, card.w, card.h, card.r, "#FFFFFF", 255);

  const stepTexts = [
    "1. REQUESTER POSTS A TASK + ESCROWED USDC REWARD",
    "2. WORKER PICKS UP THE TASK",
    "3. WORKER SUBMITS COMPLETED WORK",
    "4. REQUESTER ACCEPTS -> USDC RELEASED TO WORKER",
    "5. ALL PAYMENTS TRUSTLESS VIA X402 ON BASE",
  ];

  const stepColors = ["#E0ECFF", "#EAF8EA", "#FFF3E6", "#F3E8FF", "#E6FFFA"];
  const numberColors = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#14B8A6"];

  const box = { x: 320, w: 1080, h: 84 };
  const startY = 260;
  const gap = 112;
  const numX = 250;

  drawLine(numX, startY + 42, numX, startY + 42 + gap * 4, 6, "#CBD5E1", 255);

  for (let i = 0; i < stepTexts.length; i += 1) {
    const y = startY + i * gap;

    fillRoundedRect(box.x + 4, y + 6, box.w, box.h, 20, "#94A3B8", 35);
    fillRoundedRect(box.x, y, box.w, box.h, 20, stepColors[i], 255);

    fillCircle(numX, y + box.h / 2, 29, "#FFFFFF", 255);
    fillCircle(numX, y + box.h / 2, 24, numberColors[i], 255);
    drawText(String(i + 1), numX, y + 29, 4, "#FFFFFF", "center");

    drawWrappedCenteredText(stepTexts[i], box.x + box.w / 2, y, box.w - 60, 3, "#0F172A", box.h);

    if (i < stepTexts.length - 1) {
      const ay0 = y + box.h + 8;
      const ay1 = y + gap - 8;
      drawArrow(box.x + box.w / 2, ay0, box.x + box.w / 2, ay1, "#64748B");
    }
  }

  drawBadge(560, 820, "TRUSTLESS PAYMENTS", "#E2E8F0", "#0F172A");
  drawBadge(840, 820, "X402", "#DBEAFE", "#1D4ED8");
  drawBadge(1030, 820, "BASE", "#DCFCE7", "#166534");

  drawText("TASKMARKET.XYZ", WIDTH / 2, 915, 6, "#0F172A", "center");
}

function main() {
  render();
  const png = createPngBuffer(WIDTH, HEIGHT, pixels);

  const outPath = path.join(process.cwd(), "docs", "assets", "taskmarket-flow.png");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);

  // eslint-disable-next-line no-console
  console.log(`Generated ${outPath} (${WIDTH}x${HEIGHT})`);
}

main();