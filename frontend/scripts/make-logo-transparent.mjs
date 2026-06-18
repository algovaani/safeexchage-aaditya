import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/images/safexchange-logo-source.png');

const meta = await sharp(src).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;
const cropH = Math.max(1, Math.floor(height * 0.52));

const { data, info } = await sharp(src)
  .extract({ left: 0, top: 0, width, height: cropH })
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
  if (max < 48) out[o + 3] = 0;
  else if (max < 68 && max - min < 20) out[o + 3] = 0;
}

const processed = await sharp(out, {
  raw: { width: info.width, height: info.height, channels },
})
  .trim({ threshold: 12 })
  .extend({
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const targets = [
  join(__dirname, '../public/images/safexchange-logo.png'),
  join(__dirname, '../../landing/public/images/safexchange-logo.png'),
  join(__dirname, '../../safex/frontend/public/images/safexchange-logo.png'),
];

for (const target of targets) {
  writeFileSync(target, processed);
  console.log('Wrote', target);
}
