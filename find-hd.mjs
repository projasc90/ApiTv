// Escanea los canales < 720p buscando variantes de mayor resolución en sus masters.
import fs from 'node:fs';

const canales = JSON.parse(fs.readFileSync('canales.json', 'utf8'));
const low = [];
for (const [k, v] of Object.entries(canales)) {
  const m = k.match(/\((\d+)p\)/);
  if (m && parseInt(m[1]) < 720) low.push({ name: k, url: typeof v === 'object' ? v.url : v });
}

const out = [];
for (const c of low) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(c.url, { headers: { 'User-Agent': 'VLC/3.0.16' }, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) { out.push({ name: c.name, err: res.status }); continue; }
    const body = await res.text();
    const lines = body.split('\n').map(l => l.trim());
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const resm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
        const url = lines[i + 1] && !lines[i + 1].startsWith('#') ? lines[i + 1] : null;
        if (resm && url) {
          let abs = url;
          try { abs = new URL(url, c.url).toString(); } catch {}
          variants.push({ res: resm[1] + 'x' + resm[2], url: abs });
        }
      }
    }
    const best = variants.sort((a, b) => parseInt(b.res) - parseInt(a.res))[0];
    out.push({ name: c.name, best: best ? best.res : 'single', bestUrl: best ? best.url : null, total: variants.length });
  } catch (e) {
    out.push({ name: c.name, err: e.name });
  }
}
console.log(JSON.stringify(out, null, 1));
