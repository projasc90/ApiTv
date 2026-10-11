// Verificador de URLs del M3U: prueba cada canal y reporta estado.
// Uso: node check-canales.mjs <ruta.m3u>
import fs from 'node:fs';

const file = process.argv[2] || '/Users/pablo/Downloads/Canales.m3u';
const raw = fs.readFileSync(file, 'utf8');

const channels = [];
let pending = null;
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (t.startsWith('#EXTINF')) {
    const name = t.split(',').pop().trim();
    const logo = (t.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
    const group = (t.match(/group-title="([^"]*)"/) || [])[1] || 'TV';
    pending = { name, logo, group, url: null, opts: [] };
  } else if (t.startsWith('#EXTVLCOPT:http-user-agent=')) {
    pending?.opts.push({ ua: t.split('=').slice(1).join('=') });
  } else if (t.startsWith('#EXTVLCOPT:http-referrer=')) {
    pending?.opts.push({ referrer: t.split('=').slice(1).join('=') });
  } else if (t && !t.startsWith('#')) {
    if (pending) { pending.url = t; channels.push(pending); pending = null; }
  }
}

console.log(`Total de canales en el archivo: ${channels.length}`);

async function check(ch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16', Accept: '*/*' };
    if (ch.opts[0]?.ua) headers['User-Agent'] = ch.opts[0].ua;
    if (ch.opts[0]?.referrer) headers.Referer = ch.opts[0].referrer;
    const res = await fetch(ch.url, { headers, signal: controller.signal });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') || '';
    const isHls = ct.includes('mpegurl') || ch.url.split('?')[0].endsWith('.m3u8') || ct.includes('vnd.apple');
    return { ...ch, status: res.status, isHls };
  } catch (e) {
    clearTimeout(timer);
    return { ...ch, status: 0, isHls: false, err: e.name };
  }
}

// Concurrency 12
const results = [];
const queue = [...channels];
const workers = Array.from({ length: 12 }, async () => {
  while (queue.length) {
    const ch = queue.shift();
    const r = await check(ch);
    results.push(r);
    process.stdout.write(`${r.status === 200 && r.isHls ? 'OK ' : 'FAIL'} ${r.status} ${r.name}\n`);
  }
});
await Promise.all(workers);

const ok = results.filter(r => r.status === 200 && r.isHls);
const fail = results.filter(r => !(r.status === 200 && r.isHls));
console.log(`\n=== RESUMEN: ${ok.length} funcionan, ${fail.length} fallan ===\n`);

fs.writeFileSync('/tmp/canales-ok.json', JSON.stringify(
  ok.map(r => ({ name: r.name, url: r.url, logo: r.logo, group: r.group, needsOpts: r.opts.length > 0 })),
  null, 2
));
fs.writeFileSync('/tmp/canales-fail.json', JSON.stringify(
  fail.map(r => ({ name: r.name, url: r.url, status: r.status, err: r.err || '', needsOpts: r.opts.length > 0 })),
  null, 2
));
console.log('OK -> /tmp/canales-ok.json');
console.log('FAIL -> /tmp/canales-fail.json');
