import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "../public/images/safexchange-logo-source.jpeg");

// Tight square crop around the circular emblem only (excludes wide banner text).
const CROP = { left: 306, top: 58, side: 378 };

const { data, info } = await sharp(src)
  .extract({
    left: CROP.left,
    top: CROP.top,
    width: CROP.side,
    height: CROP.side,
  })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { channels } = info;
const out = Buffer.from(data);
for (let i = 0; i < info.width * info.height; i++) {
  const o = i * channels;
  const r = out[o];
  const g = out[o + 1];
  const b = out[o + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 235 && max - min < 25) out[o + 3] = 0;
  else if (max < 48) out[o + 3] = 0;
  else if (max < 68 && max - min < 20) out[o + 3] = 0;
}

const processed = await sharp(out, {
  raw: { width: info.width, height: info.height, channels },
})
  .trim({ threshold: 10 })
  .png()
  .toBuffer();

const targets = [
  join(__dirname, "../public/images/safexchange-logo.jpeg"),
  join(__dirname, "../../landing/public/images/safexchange-logo.jpeg"),
  join(__dirname, "../../safex/frontend/public/images/safexchange-logo.jpeg"),
];

for (const target of targets) {
  writeFileSync(target, processed);
  const meta = await sharp(target).metadata();
  console.log("Wrote", target, `${meta.width}x${meta.height}`);
}
