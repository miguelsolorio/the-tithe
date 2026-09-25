// Renders the icon set, the social preview and the README screenshots with
// headless Chrome over the DevTools protocol (no dependencies, see cdp.mjs).
//
//   node branding/render.mjs          public/: icons, favicon.ico, og.png (from branding/sigil.html)
//   node branding/render.mjs shots    docs/screenshots/ from the running game (`npm run dev` first;
//                                     GAME_URL=http://localhost:5299 for the stable server)
//   node branding/render.mjs shots heart cistern   only these shots
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluate, sleep, withBrowser } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PUBLIC = resolve(ROOT, 'public');
const SHOTS = resolve(ROOT, 'docs/screenshots');
const GAME = process.env.GAME_URL || 'http://localhost:5199';

// Each shot starts a debug run at `level`, then `setup` (run in the page)
// places the camera. The HUD is hidden; `arms: false` hides the weapon too.
const SHOT_LIST = [
  {
    name: 'field',
    level: 'field',
    arms: false,
    setup: `game.camera.fov = 50; game.camera.updateProjectionMatrix();
      game.place(9.5, 17.5, -5, 0.6, 0.07); await game.wait(3500);`,
  },
  {
    name: 'chapel',
    level: 'ground',
    arms: false,
    flags: ['chapel.open', 'chapel.lit'],
    setup: `game.player.flashOn = true; game.place(14.4, -5.5, 20.3, -5.5, -0.04); await game.wait(2500);
      game.spawn('acolyte', 4.6); await game.wait(900);`,
  },
  {
    name: 'basement',
    level: 'basement',
    arms: false,
    setup: `game.player.flashOn = true; game.place(19.4, -2, 25.1, -2, -0.1, 0); await game.wait(2500);`,
  },
  {
    name: 'cistern',
    level: 'cistern',
    setup: `game.player.flashOn = true; game.place(23, 18.5, 23, 12, -0.12); await game.wait(2500);`,
  },
  {
    name: 'caves',
    level: 'caves',
    setup: `game.player.flashOn = true; game.place(-13.2, 23, -24, 23, -0.05); await game.wait(2500);`,
  },
  {
    name: 'heart',
    level: 'heart',
    arms: false,
    setup: `game.player.flashOn = true; game.place(0, 10, 0, 0, 0.28); await game.wait(7000);`,
  },
];

// Loads `url` at width × height and returns a PNG of the viewport.
async function capture(cdp, { url, width, height, setup, transparent = false }) {
  const { send, once } = cdp;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  if (setup) await evaluate(cdp, setup);
  await evaluate(cdp, 'document.fonts.ready.then(() => 1)');
  await sleep(300);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}

// High-quality downscale in the page: [[w, h], ...] → one buffer of `type` each.
async function resize(cdp, png, sizes, type = 'image/png', quality = 0.9) {
  const out = await evaluate(
    cdp,
    `(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${png.toString('base64')}';
      await img.decode();
      const out = [];
      for (const [w, h] of ${JSON.stringify(sizes)}) {
        const bmp = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        const c = new OffscreenCanvas(w, h);
        c.getContext('2d').drawImage(bmp, 0, 0);
        const bytes = new Uint8Array(await (await c.convertToBlob({ type: '${type}', quality: ${quality} })).arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        out.push(btoa(s));
      }
      return out;
    })()`,
  );
  return out.map((b) => Buffer.from(b, 'base64'));
}

// A .ico holding PNG images.
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size, e);
    head.writeUInt8(size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((im) => im.png)]);
}

function write(file, buf) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log(`wrote ${relative(ROOT, file)} (${Math.round(buf.length / 1024)} kB)`);
}

async function brand(cdp) {
  const sigil = (kind) => pathToFileURL(resolve(HERE, 'sigil.html')).href + `?kind=${kind}`;
  const icon = await capture(cdp, { url: sigil('icon'), width: 1024, height: 1024 });
  const maskable = await capture(cdp, { url: sigil('maskable'), width: 1024, height: 1024 });
  const og = await capture(cdp, { url: sigil('og'), width: 1200, height: 630 });
  const [i512, i192, i180] = await resize(cdp, icon, [[512, 512], [192, 192], [180, 180]]);
  const [m512] = await resize(cdp, maskable, [[512, 512]]);
  write(resolve(PUBLIC, 'icon-512.png'), i512);
  write(resolve(PUBLIC, 'icon-192.png'), i192);
  write(resolve(PUBLIC, 'apple-touch-icon.png'), i180);
  write(resolve(PUBLIC, 'icon-maskable-512.png'), m512);
  write(resolve(PUBLIC, 'og.png'), og);
  // favicon.ico from the vector favicon, rendered large and scaled down.
  const fav = await capture(cdp, { url: pathToFileURL(resolve(PUBLIC, 'favicon.svg')).href, width: 256, height: 256, transparent: true });
  const sizes = [16, 32, 48];
  const pngs = await resize(cdp, fav, sizes.map((s) => [s, s]));
  write(resolve(PUBLIC, 'favicon.ico'), ico(sizes.map((size, i) => ({ size, png: pngs[i] }))));
}

// Screenshots render at 2560 × 1440 and are scaled to 1280 × 720 (the game
// renders without antialiasing, so this smooths the edges).
async function shots(cdp, only) {
  for (const s of SHOT_LIST.filter((s) => !only.length || only.includes(s.name))) {
    const setup = `(async () => {
      await game.start({ level: '${s.level}' });
      ${s.flags ? `for (const f of ${JSON.stringify(s.flags)}) game.setFlag(f); await game.teleport('${s.level}');` : ''}
      await game.wait(1500);
      game.god(true);
      document.querySelector('#hud').style.display = 'none';
      ${s.arms === false ? 'game.weapons.scene.visible = false;' : ''}
      ${s.setup}
    })()`;
    const png = await capture(cdp, { url: `${GAME}/?debug&level=${s.level}`, width: 2560, height: 1440, setup });
    const [jpg] = await resize(cdp, png, [[1280, 720]], 'image/jpeg', 0.86);
    write(resolve(SHOTS, `${s.name}.jpg`), jpg);
  }
}

const [mode = 'brand', ...only] = process.argv.slice(2);
await withBrowser((cdp) => (mode === 'shots' ? shots(cdp, only) : brand(cdp)));
