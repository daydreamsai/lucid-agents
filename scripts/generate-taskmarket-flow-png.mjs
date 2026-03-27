#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const WIDTH = 1600;
const HEIGHT = 1000;
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

const WHITE = [255, 255, 255, 255];
const DARK = [15, 23, 42, 255];
const MUTED = [71, 85, 105, 255];

const ACCENTS = [
  [37, 99, 235, 255],   // blue
  [14, 165, 233, 255],  // cyan
  [16, 185, 129, 255],  // emerald
  [245, 158, 11, 255],  // amber
  [168, 85, 247, 255]   // violet
];

const FONT_5X7 = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00001', '00001', '00001', '00001', '10001', '10001', '01110'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111']
};

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function fillBackgroundGradient(top, bottom) {
  for (let y = 0; y < HEIGHT; y++) {
    const t = y / (HEIGHT - 1);
    const r = lerp(top[0], bottom[0], t);
    const g = lerp(top[1], bottom[1], t);
    const b = lerp(top[2], bottom[2], t);
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }
}

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const idx = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  const [sr, sg, sb, sa] = color;

  if (sa === 255) {
    pixels[idx] = sr;
    pixels[idx + 1] = sg;
    pixels[idx + 2] = sb;
    pixels[idx + 3] = 255;
    return;
  }

  if (sa === 0) return;

  const dr = pixels[idx];
  const dg = pixels[idx + 1];
  const db = pixels[idx + 2];
  const da = pixels[idx + 3];

  const srcA = sa / 255;
  const dstA = da / 255;
  const outA = srcA + dstA * (1 - srcA);

  if (outA <= 0) return;

  const outR = Math.round((sr * srcA + dr * dstA * (1 - srcA)) / outA);
  const outG = Math.round((sg * srcA + dg * dstA * (1 - srcA)) / outA);
  const outB = Math.round((sb * srcA + db * dstA * (1 - srcA)) / outA);

  pixels[idx] = outR;
  pixels[idx + 1] = outG;
  pixels[idx + 2] = outB;
  pixels[idx + 3] = Math.round(outA * 255);
}

function fillRect(x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(WIDTH, Math.floor(x + w));
  const y1 = Math.min(HEIGHT, Math.floor(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPixel(px, py, color);
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  const r = Math.floor(radius);
  const r2 = r * r;
  const x0 = Math.floor(cx - r);
  const x1 = Math.floor(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.floor(cy + r);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(x, y, color);
      }
    }
  }
}

function fillRoundedRect(x, y, w, h, r, color) {
  const radius = Math.max(0, Math.min(r, Math.floor(w / 2), Math.floor(h / 2)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.floor(x + w);
  const y1 = Math.floor(y + h);
  const rr = radius * radius;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let inside = true;

      if (px < x0 + radius && py < y0 + radius) {
        const dx = px - (x0 + radius);
        const dy = py - (y0 + radius);
        inside = dx * dx + dy * dy <= rr;
      } else if (px >= x1 - radius && py < y0 + radius) {
        const dx = px - (x1 - radius - 1);
        const dy = py - (y0 + radius);
        inside = dx * dx + dy * dy <= rr;
      } else if (px < x0 + radius && py >= y1 - radius) {
        const dx = px - (x0 + radius);
        const dy = py - (y1 - radius - 1);
        inside = dx * dx + dy * dy <= rr;
      } else if (px >= x1 - radius && py >= y1 - radius) {
        const dx = px - (x1 - radius - 1);
        const dy = py - (y1 - radius - 1);
        inside = dx * dx + dy * dy <= rr;
      }

      if (inside) setPixel(px, py, color);
    }
  }
}

function drawLine(x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const radius = Math.max(1, Math.floor(thickness / 2));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    fillCircle(x, y, radius, color);
  }
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (denom === 0) return false;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;

  return u >= 0 && v >= 0 && u + v <= 1;
}

function fillTriangle(ax, ay, bx, by, cx, cy, color) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) {
        setPixel(x, y, color);
      }
    }
  }
}

function drawArrow(x0, y0, x1, y1, color) {
  drawLine(x0, y0, x1, y1, 6, color);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const headLen = 20;
  const headAngle = Math.PI / 6;

  const x2 = x1 - headLen * Math.cos(angle - headAngle);
  const y2 = y1 - headLen * Math.sin(angle - headAngle);
  const x3 = x1 - headLen * Math.cos(angle + headAngle);
  const y3 = y1 - headLen * Math.sin(angle + headAngle);

  fillTriangle(x1, y1, x2, y2, x3, y3, color);
}

function drawGlyph(ch, x, y, scale, color) {
  const glyph = FONT_5X7[ch] ?? FONT_5X7['?'];
  for (let row = 0; row < glyph.length; row++) {
    const bits = glyph[row];
    for (let col = 0; col < bits.length; col++) {
      if (bits[col] === '1') {
        fillRect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

function measureText(text, scale) {
  if (!text.length) return 0;
  return text.length * 6 * scale - scale;
}

function drawTextLine(text, x, y, scale, color, align = 'left') {
  const normalized = text.toUpperCase();
  const width = measureText(normalized, scale);
  let cursorX = Math.round(align === 'center' ? x - width / 2 : x);

  for (const ch of normalized) {
    drawGlyph(ch, cursorX, y, scale, color);
    cursorX += 6 * scale;
  }
}

function wrapText(text, maxWidth, scale) {
  const lines = [];
  const paragraphs = text.toUpperCase().split('\n');

  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p].split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (measureText(candidate, scale) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];

        while (measureText(current, scale) > maxWidth && current.length > 1) {
          let splitAt = current.length - 1;
          while (splitAt > 1 && measureText(current.slice(0, splitAt), scale) > maxWidth) {
            splitAt--;
          }
          lines.push(current.slice(0, splitAt));
          current = current.slice(splitAt);
        }
      }
    }
    lines.push(current);

    if (p < paragraphs.length - 1) {
      lines.push('');
    }
  }

  return lines;
}

function drawTextBlock(text, x, y, maxWidth, scale, color, align = 'left', lineGap = 4) {
  const lines = wrapText(text, maxWidth, scale);
  const lineHeight = 7 * scale + lineGap;
  for (let i = 0; i < lines.length; i++) {
    drawTextLine(lines[i], x, y + i * lineHeight, scale, color, align);
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rawRowStart = y * (stride + 1);
    raw[rawRowStart] = 0; // filter type 0
    rgbaBuffer.copy(raw, rawRowStart + 1, y * stride, y * stride + stride);
  }

  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function drawCard({ x, y, w, h, step, text, accent }) {
  fillRoundedRect(x + 7, y + 10, w, h, 22, [15, 23, 42, 36]); // shadow
  fillRoundedRect(x, y, w, h, 22, WHITE);

  fillRect(x, y, w, 12, accent);
  fillCircle(x + 36, y + 40, 22, accent);

  const stepText = String(step);
  const stepWidth = measureText(stepText, 4);
  drawTextLine(stepText, x + 36 - stepWidth / 2, y + 26, 4, WHITE, 'left');

  drawTextLine(`STEP ${step}`, x + 74, y + 30, 2, accent, 'left');
  drawTextBlock(text, x + 20, y + 92, w - 40, 3, DARK, 'left', 7);
}

function drawScene() {
  fillBackgroundGradient([244, 248, 255, 255], [236, 243, 255, 255]);

  fillRoundedRect(48, 26, 440, 44, 22, [226, 232, 240, 255]);
  drawTextLine('USDC ESCROW + BASE + X402', 268, 41, 2, [51, 65, 85, 255], 'center');

  drawTextLine('TASKMARKET END-TO-END FLOW', WIDTH / 2, 96, 7, DARK, 'center');
  drawTextLine('REQUEST -> WORK -> SUBMIT -> ACCEPT -> TRUSTLESS PAYOUT', WIDTH / 2, 152, 3, MUTED, 'center');

  const steps = [
    'REQUESTER POSTS A TASK + ESCROWED USDC REWARD',
    'WORKER PICKS UP THE TASK',
    'WORKER SUBMITS COMPLETED WORK',
    'REQUESTER ACCEPTS -> USDC RELEASED TO WORKER',
    'ALL PAYMENTS TRUSTLESS VIA X402 ON BASE'
  ];

  const marginX = 70;
  const gap = 20;
  const cardY = 250;
  const cardH = 500;
  const cardW = Math.floor((WIDTH - marginX * 2 - gap * 4) / 5);

  for (let i = 0; i < steps.length; i++) {
    const x = marginX + i * (cardW + gap);
    drawCard({
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      step: i + 1,
      text: steps[i],
      accent: ACCENTS[i]
    });

    if (i < steps.length - 1) {
      const x0 = x + cardW + 7;
      const x1 = marginX + (i + 1) * (cardW + gap) - 7;
      const yMid = cardY + Math.floor(cardH / 2);
      drawArrow(x0, yMid, x1, yMid, [100, 116, 139, 255]);
    }
  }

  fillRoundedRect(WIDTH / 2 - 240, HEIGHT - 118, 480, 66, 33, [15, 23, 42, 255]);
  drawTextLine('TASKMARKET.XYZ', WIDTH / 2, HEIGHT - 96, 4, WHITE, 'center');
}

function main() {
  drawScene();
  const png = encodePng(WIDTH, HEIGHT, pixels);
  const outputPath = resolve(process.cwd(), 'docs/assets/taskmarket-flow.png');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, png);
  process.stdout.write(`Generated ${outputPath}\n`);
}

main();