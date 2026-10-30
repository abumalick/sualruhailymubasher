import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const POINTS =
  '50.0,2.0 64.1,16.1 83.9,16.1 83.9,35.9 98.0,50.0 83.9,64.1 83.9,83.9 64.1,83.9 50.0,98.0 35.9,83.9 16.1,83.9 16.1,64.1 2.0,50.0 16.1,35.9 16.1,16.1 35.9,16.1';
const BG = '#1c0b1a';

const svg = (size, starSize, { background }) => {
  const offset = (size - starSize) / 2;
  const scale = starSize / 100;
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b46a"/><stop offset="1" stop-color="#a67c37"/></linearGradient></defs>
${background ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
<polygon transform="translate(${offset} ${offset}) scale(${scale})" points="${POINTS}" fill="url(#g)"/>
</svg>`);
};

const out = (name, buf) => sharp(buf).png().toFile(`resources/${name}`);

mkdirSync('resources', { recursive: true });
await Promise.all([
  out('icon.png', svg(1024, 560, { background: true })),
  out('icon-foreground.png', svg(1024, 560, { background: false })),
  out('icon-background.png', Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`)),
  out('splash.png', svg(2732, 700, { background: true })),
  out('splash-dark.png', svg(2732, 700, { background: true })),
]);
