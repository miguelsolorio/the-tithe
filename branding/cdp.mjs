// Minimal headless Chrome driver over the DevTools protocol (no dependencies),
// shared by render.mjs and record-demo.mjs.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts Chrome, calls fn({ send, once, on }) with the first page, then quits;
// resolves to what fn returns.
export async function withBrowser(fn, { port = 9339, flags = ['--mute-audio'], profile = 'tithe-branding-chrome', headless = true } = {}) {
  const dir = resolve(tmpdir(), profile);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  const chrome = spawn(
    CHROME,
    [
      ...(headless ? ['--headless=new'] : []),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      // Otherwise a fresh profile can block on a macOS keychain prompt.
      '--use-mock-keychain',
      '--password-store=basic',
      '--autoplay-policy=no-user-gesture-required',
      ...flags,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let page;
  for (let i = 0; i < 300 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t) => t.type === 'page');
    } catch {
      await sleep(100);
    }
  }
  if (!page) {
    chrome.kill();
    throw new Error('Chrome did not start');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  // on(method, cb) → unsubscribe; once(method) → promise of the next event's params.
  const on = (method, cb) => {
    const l = (m) => m.method === method && cb(m.params);
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const once = (method) =>
    new Promise((r) => {
      const off = on(method, (p) => {
        off();
        r(p);
      });
    });
  await send('Page.enable');
  await send('Runtime.enable');
  try {
    return await fn({ send, once, on });
  } finally {
    ws.close();
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await exited;
  }
}

export async function evaluate({ send }, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
