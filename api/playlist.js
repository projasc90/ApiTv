import canales from '../canales.json' with { type: 'json' };

function prettifyId(id) {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function handler(req, res) {
  // CORS por si la playlist se consulta desde un navegador
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Método no permitido. Usa GET.' });
  }

  // URL pública del deployment (Vercel entrega el host real en estos headers)
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const base = `${proto}://${host}`;

  // Guías EPG (XMLTV de iptv-epg.org) de los países con canales mapeados
  const guides = [...new Set(
    Object.values(canales)
      .filter((v) => v && typeof v === 'object' && v.epg)
      .map((v) => v.epg.split('.').pop().toLowerCase())
  )].sort().map((cc) => `https://iptv-epg.org/files/epg-${cc}.xml.gz`);
  const tvgUrl = guides.join(',');

  const lines = [tvgUrl
    ? `#EXTM3U x-tvg-url="${tvgUrl}" url-tvg="${tvgUrl}"`
    : '#EXTM3U'];

  for (const [id, value] of Object.entries(canales)) {
    const isObject = typeof value === 'object' && value !== null;
    const url = isObject ? value.url : value;
    if (!url) continue;

    const name = (isObject && value.name) || prettifyId(id);
    const logo = isObject ? value.logo : undefined;
    const group = (isObject && value.group) || 'TV';

    // epg: tvg-id del EPG de iptv-epg.org (coincide con <channel id="...">)
    const attrs = [`tvg-id="${(isObject && value.epg) || id}"`];
    if (logo) attrs.push(`tvg-logo="${logo}"`);
    attrs.push(`group-title="${group}"`);

    lines.push(`#EXTINF:-1 ${attrs.join(' ')},${name}`);
    // Cada canal apunta al proxy HLS, que inyecta CORS y reescribe el manifiesto
    lines.push(`${base}/api/proxy?id=${encodeURIComponent(id)}`);
  }

  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(lines.join('\n') + '\n');
}
