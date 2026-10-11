// Enriquecedor de logos: cruza canales.json con la API de iptv-org
// (channels.json + logos.json) y actualiza/normaliza los logos.
//
// Matching en 3 niveles: por tvg-id (exacto), por nombre normalizado exacto,
// por nombre sin sufijo de calidad ("(720p)" etc.).
// Uso: node update-logos.mjs [--force]   (--force reemplaza logos existentes)
import fs from 'node:fs';

const FORCE = process.argv.includes('--force');
const file = 'canales.json';
const canales = JSON.parse(fs.readFileSync(file, 'utf8'));

const apiChannels = JSON.parse(fs.readFileSync('/tmp/iptv-channels.json', 'utf8'));
const apiLogos = JSON.parse(fs.readFileSync('/tmp/iptv-logos.json', 'utf8'));

// Índice de logos: mejor logo (mayor resolución, in_use preferido) por canal
const logosByChannel = new Map();
for (const l of apiLogos) {
  const cur = logosByChannel.get(l.channel);
  const score = (l.in_use ? 1e6 : 0) + l.width * l.height;
  if (!cur || score > cur.score) logosByChannel.set(l.channel, { ...l, score });
}

const norm = (s) =>
  s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/\(.*?\)/g, '')         // sin "(720p)" etc.
    .replace(/[^a-z0-9]/g, '');

// Índices de búsqueda en la API
const byName = new Map(); // norm(name) -> [ids]
const byAltName = new Map();
for (const c of apiChannels) {
  for (const key of [norm(c.name), ...c.alt_names.map(norm)]) {
    const idx = c.alt_names.some(a => norm(a) === key) && norm(c.name) !== key ? byAltName : byName;
    if (!key) continue;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(c.id);
  }
}

let updated = 0, keptBetter = 0, notFound = 0, keptMissing = 0;
const report = [];

for (const [key, entry] of Object.entries(canales)) {
  const isObj = typeof entry === 'object' && entry !== null;
  const cfg = isObj ? entry : (canales[key] = { url: entry });
  const cleanName = key.replace(/\s*\((\d+p|X\d+)\)\s*/i, '').trim();
  const nName = norm(key);
  const nClean = norm(cleanName);

  // Buscar id de canal en la API
  let ids = byName.get(nName) || byName.get(nClean) || [];
  if (!ids.length) ids = byAltName.get(nClean) || [];
  // Fallback: contiene (ej. "Repretel Canal 6" vs "Repretel 6")
  if (!ids.length) {
    for (const [k, v] of byName) {
      if (k.length > 3 && (nName.includes(k) || k.includes(nName))) { ids = v; break; }
    }
  }

  const apiId = ids[0];
  const logo = apiId ? logosByChannel.get(apiId) : undefined;

  if (logo?.url) {
    if (!cfg.logo || FORCE) {
      const old = cfg.logo;
      cfg.logo = logo.url;
      updated++;
      report.push(`${old && old !== logo.url ? 'UPDATE' : 'ADD   '} ${key} -> ${logo.url} (${logo.width}x${logo.height})`);
    } else {
      keptBetter++;
    }
  } else {
    if (cfg.logo) keptMissing++;
    else { notFound++; report.push(`NOLOGO ${key}`); }
  }
}

// Ordenar y limpiar
const sorted = Object.fromEntries(
  Object.entries(canales).sort(([a], [b]) => a.localeCompare(b, 'es'))
);
fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');

console.log(`\n=== RESUMEN ===`);
console.log(`Actualizados/añadidos: ${updated}`);
console.log(`Conservados (ya tenían logo): ${keptBetter}`);
console.log(`Sin logo en la API pero con logo local: ${keptMissing}`);
console.log(`Sin logo en ningún lado: ${notFound}`);
console.log(`Total canales: ${Object.keys(canales).length}\n`);
if (process.argv.includes('-v')) console.log(report.join('\n'));
