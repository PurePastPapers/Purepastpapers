// Renders the promo to MP4: captures every frame of index.html with headless Chromium,
// writes the sound-effect cues for music.py, then encodes with ffmpeg.
//
//   node render.mjs                 cues + frames + encode (uses out/promo-audio.wav if present)
//   node render.mjs --cues-only     only write out/cues.json
//   node render.mjs --fps=30 --scale=0.5 --out=preview.mp4   quick low-res preview
//   node render.mjs --encode-only   re-encode existing frames (e.g. after new audio)
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v = true] = a.replace(/^--/, '').split('='); return [k, v]; }));
const FPS = Number(args.fps || 60);
const SCALE = Number(args.scale || 1);
const WORKERS = Number(args.workers || 4);
const PORT = Number(args.port || 5199);
const FRAMES = path.join(OUT, `frames-${FPS}-${SCALE}`);
const VIDEO = path.join(OUT, args.out || 'purepastpapers-the-science-bit.mp4');
const AUDIO = path.join(OUT, 'promo-audio.wav');

fs.mkdirSync(OUT, { recursive: true });

async function startServer() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('http://')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server exited (${code})`)));
  });
  return server;
}

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/tools/promo-video/index.html?render=1`);
  await page.evaluate(() => window.PROMO.ready);
  return page;
}

function encode(duration) {
  const hasAudio = fs.existsSync(AUDIO);
  const ff = [
    '-y', '-loglevel', 'error', '-stats',
    '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.jpg'),
    ...(hasAudio ? ['-i', AUDIO] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', SCALE < 1 ? '23' : '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-tune', 'animation', '-movflags', '+faststart', '-t', String(duration),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
    VIDEO,
  ];
  console.log(`encoding ${hasAudio ? 'with' : 'WITHOUT'} audio -> ${VIDEO}`);
  const run = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
  if (run.status !== 0) throw new Error('ffmpeg failed');
}

const server = await startServer();
const browser = await chromium.launch();
try {
  const first = await openPage(browser);
  const meta = await first.evaluate(() => ({ duration: window.PROMO.duration, bpm: window.PROMO.bpm, sceneStarts: window.PROMO.sceneStarts, cues: window.PROMO.cues }));
  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(meta, null, 1));
  console.log(`cues.json: ${meta.cues.length} cues, ${meta.duration}s`);

  if (!args['cues-only'] && !args['encode-only']) {
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.mkdirSync(FRAMES, { recursive: true });
    const total = Math.round(meta.duration * FPS);
    const pages = [first, ...(await Promise.all(Array.from({ length: WORKERS - 1 }, () => openPage(browser))))];
    const started = Date.now();
    let done = 0;
    await Promise.all(pages.map(async (page, w) => {
      for (let f = w; f < total; f += WORKERS) {
        await page.evaluate((t) => window.PROMO.seek(t), f / FPS);
        await page.screenshot({ path: path.join(FRAMES, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
        if (++done % 300 === 0) console.log(`${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
      }
    }));
    console.log(`captured ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  if (!args['cues-only']) encode(meta.duration);
} finally {
  await browser.close();
  server.kill();
}
