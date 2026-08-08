/**
 * Dev-time only: generate PWA PNG icons from the compass design.
 * No production dependency — run with: node icons/_generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createCanvas(size) {
    return {
        size,
        data: new Uint8Array(size * size * 4)
    };
}

function setPixel(canvas, x, y, r, g, b, a = 255) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= canvas.size || yi >= canvas.size) {
        return;
    }
    const i = (yi * canvas.size + xi) * 4;
    canvas.data[i] = r;
    canvas.data[i + 1] = g;
    canvas.data[i + 2] = b;
    canvas.data[i + 3] = a;
}

function fillRect(canvas, x0, y0, w, h, color, rx = 0) {
    const [r, g, b, a = 255] = color;
    for (let y = Math.floor(y0); y < y0 + h; y++) {
        for (let x = Math.floor(x0); x < x0 + w; x++) {
            if (rx > 0) {
                const lx = x - x0;
                const ly = y - y0;
                const rr = rx;
                const inCorner =
                    (lx < rr && ly < rr && (lx - rr) ** 2 + (ly - rr) ** 2 > rr * rr) ||
                    (lx > w - 1 - rr &&
                        ly < rr &&
                        (lx - (w - 1 - rr)) ** 2 + (ly - rr) ** 2 > rr * rr) ||
                    (lx < rr &&
                        ly > h - 1 - rr &&
                        (lx - rr) ** 2 + (ly - (h - 1 - rr)) ** 2 > rr * rr) ||
                    (lx > w - 1 - rr &&
                        ly > h - 1 - rr &&
                        (lx - (w - 1 - rr)) ** 2 + (ly - (h - 1 - rr)) ** 2 >
                            rr * rr);
                if (inCorner) {
                    continue;
                }
            }
            setPixel(canvas, x, y, r, g, b, a);
        }
    }
}

function fillCircle(canvas, cx, cy, radius, color) {
    const [r, g, b, a = 255] = color;
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
        for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            if (dx * dx + dy * dy <= r2) {
                setPixel(canvas, x, y, r, g, b, a);
            }
        }
    }
}

function strokeCircle(canvas, cx, cy, radius, thickness, color) {
    const [r, g, b, a = 255] = color;
    const outer = radius + thickness / 2;
    const inner = Math.max(0, radius - thickness / 2);
    const o2 = outer * outer;
    const i2 = inner * inner;
    for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
        for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 <= o2 && d2 >= i2) {
                setPixel(canvas, x, y, r, g, b, a);
            }
        }
    }
}

function fillTriangle(canvas, ax, ay, bx, by, cx, cy, color) {
    const [r, g, b, a = 255] = color;
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));

    function edge(x0, y0, x1, y1, x, y) {
        return (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0);
    }

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const w0 = edge(bx, by, cx, cy, x + 0.5, y + 0.5);
            const w1 = edge(cx, cy, ax, ay, x + 0.5, y + 0.5);
            const w2 = edge(ax, ay, bx, by, x + 0.5, y + 0.5);
            if (
                (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
                (w0 <= 0 && w1 <= 0 && w2 <= 0)
            ) {
                setPixel(canvas, x, y, r, g, b, a);
            }
        }
    }
}

function lerpColor(c0, c1, t) {
    return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
        255
    ];
}

function drawIcon(size, { maskable = false } = {}) {
    const canvas = createCanvas(size);
    const safe = maskable ? 0.8 : 1;
    const offset = ((1 - safe) / 2) * size;
    const s = (v) => offset + v * safe;
    const sc = (v) => v * safe;

    // Background
    if (maskable) {
        fillRect(canvas, 0, 0, size, size, [8, 13, 22, 255]);
    } else {
        const rr = Math.round(size * 0.22);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let inside = true;
                if (x < rr && y < rr) {
                    inside = (x - rr) ** 2 + (y - rr) ** 2 <= rr * rr;
                } else if (x > size - 1 - rr && y < rr) {
                    inside =
                        (x - (size - 1 - rr)) ** 2 + (y - rr) ** 2 <= rr * rr;
                } else if (x < rr && y > size - 1 - rr) {
                    inside =
                        (x - rr) ** 2 + (y - (size - 1 - rr)) ** 2 <= rr * rr;
                } else if (x > size - 1 - rr && y > size - 1 - rr) {
                    inside =
                        (x - (size - 1 - rr)) ** 2 +
                            (y - (size - 1 - rr)) ** 2 <=
                        rr * rr;
                }
                if (!inside) {
                    continue;
                }
                const t = (x + y) / (2 * size);
                const c = lerpColor([13, 20, 33], [8, 13, 22], t);
                setPixel(canvas, x, y, c[0], c[1], c[2], 255);
            }
        }
    }

    const cx = s(size / 2);
    const cy = s(size / 2);
    const ringR = sc(size * 0.328);
    const ringT = Math.max(2, sc(size * 0.055));
    const innerR = sc(size * 0.23);
    const innerT = Math.max(1, sc(size * 0.02));

    // Outer ring gradient approximated as orange-blue mix by angle
    strokeCircle(canvas, cx, cy, ringR, ringT, [255, 138, 36, 255]);
    // Overpaint right/bottom with blue-ish for dual accent
    const outer = ringR + ringT / 2;
    const inner = Math.max(0, ringR - ringT / 2);
    for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
        for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 <= outer * outer && d2 >= inner * inner) {
                const t = Math.max(0, Math.min(1, (dx + dy + size * 0.5) / size));
                const c = lerpColor([255, 138, 36], [40, 135, 255], t);
                setPixel(canvas, x, y, c[0], c[1], c[2], 255);
            }
        }
    }

    strokeCircle(canvas, cx, cy, innerR, innerT, [38, 54, 77, 255]);

    // Needle
    fillTriangle(
        canvas,
        cx,
        cy - sc(size * 0.27),
        cx + sc(size * 0.07),
        cy,
        cx,
        cy - sc(size * 0.04),
        [255, 138, 36, 255]
    );
    fillTriangle(
        canvas,
        cx,
        cy - sc(size * 0.27),
        cx - sc(size * 0.07),
        cy,
        cx,
        cy - sc(size * 0.04),
        [255, 159, 77, 255]
    );
    fillTriangle(
        canvas,
        cx,
        cy + sc(size * 0.27),
        cx - sc(size * 0.07),
        cy,
        cx,
        cy + sc(size * 0.04),
        [40, 135, 255, 255]
    );
    fillTriangle(
        canvas,
        cx,
        cy + sc(size * 0.27),
        cx + sc(size * 0.07),
        cy,
        cx,
        cy + sc(size * 0.04),
        [74, 155, 255, 255]
    );

    fillCircle(canvas, cx, cy, sc(size * 0.043), [244, 247, 251, 255]);
    fillCircle(canvas, cx, cy, sc(size * 0.02), [8, 13, 22, 255]);

    // Cardinal ticks
    const tw = Math.max(2, sc(size * 0.039));
    const th = Math.max(3, sc(size * 0.055));
    fillRect(
        canvas,
        cx - tw / 2,
        cy - sc(size * 0.348) - th / 2,
        tw,
        th,
        [255, 138, 36, 255],
        2
    );
    fillRect(
        canvas,
        cx - tw / 2,
        cy + sc(size * 0.348) - th / 2,
        tw,
        th,
        [40, 135, 255, 255],
        2
    );
    fillRect(
        canvas,
        cx - sc(size * 0.348) - th / 2,
        cy - tw / 2,
        th,
        tw,
        [150, 166, 187, 255],
        2
    );
    fillRect(
        canvas,
        cx + sc(size * 0.348) - th / 2,
        cy - tw / 2,
        th,
        tw,
        [150, 166, 187, 255],
        2
    );

    return canvas;
}

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
        }
    }
    return ~c >>> 0;
}

function pngChunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(canvas) {
    const { size, data } = canvas;
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0;
        for (let x = 0; x < size; x++) {
            const src = (y * size + x) * 4;
            const dst = rowStart + 1 + x * 4;
            raw[dst] = data[src];
            raw[dst + 1] = data[src + 1];
            raw[dst + 2] = data[src + 2];
            raw[dst + 3] = data[src + 3];
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([
        signature,
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw, { level: 9 })),
        pngChunk("IEND", Buffer.alloc(0))
    ]);
}

function writeIcon(name, size, options) {
    const png = encodePng(drawIcon(size, options));
    const path = join(__dirname, name);
    writeFileSync(path, png);
    console.log(`Wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}

mkdirSync(__dirname, { recursive: true });
writeIcon("icon-192.png", 192);
writeIcon("icon-512.png", 512);
writeIcon("icon-maskable-512.png", 512, { maskable: true });
writeIcon("apple-touch-icon.png", 180);
console.log("Done.");
