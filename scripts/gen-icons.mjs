// 외부 의존성 없이 PWA 아이콘 PNG 를 생성한다: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BLUE = [47, 111, 223];
const WHITE = [255, 255, 255];
const INK = [29, 31, 36];
const SOFT = [205, 220, 248];

/** 좌표(0..1)에서의 색을 돌려준다. null 이면 투명 */
function shade(x, y, { rounded, scale }) {
  if (rounded) {
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  }
  // 안쪽 보드 영역 (maskable 은 안전 영역을 위해 더 작게)
  const half = 0.3 * scale;
  const lo = 0.5 - half, hi = 0.5 + half;
  if (x < lo || x > hi || y < lo || y > hi) return BLUE;
  const u = (x - lo) / (hi - lo), v = (y - lo) / (hi - lo);
  const thick = 0.035, thin = 0.012;
  const near = (t, k) => Math.abs(t - k) < thick / 2;
  if (u < thick || u > 1 - thick || v < thick || v > 1 - thick) return INK;
  if (near(u, 1 / 3) || near(u, 2 / 3) || near(v, 1 / 3) || near(v, 2 / 3)) return INK;
  const cu = Math.floor(u * 9), cv = Math.floor(v * 9);
  const fu = u * 9 - cu, fv = v * 9 - cv;
  if (fu < thin * 9 / 2 || fv < thin * 9 / 2) return [190, 196, 206];
  // 선택된 칸 + 같은 행 하이라이트
  if (cu === 4 && cv === 4) return BLUE;
  if (cv === 4 || cu === 4) return SOFT;
  return WHITE;
}

function render(size, opts) {
  const ss = 4; // 슈퍼샘플링
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, opts);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      }
      const n = ss * ss, o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  return png(size, size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('pwa-192.png', out), render(192, { rounded: true, scale: 1 }));
writeFileSync(new URL('pwa-512.png', out), render(512, { rounded: true, scale: 1 }));
writeFileSync(new URL('pwa-maskable-512.png', out), render(512, { rounded: false, scale: 0.8 }));
// iOS 는 투명 배경과 둥근 모서리를 직접 처리하므로 꽉 찬 정사각형으로
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { rounded: false, scale: 0.9 }));
console.log('icons written');
