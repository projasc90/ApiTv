import canales from './_canales.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function prettifyId(id) {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Usa GET.' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // Host público: Netlify entrega el dominio del viewer en x-forwarded-host
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
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
    if (logo) attrs.push(`tvg-logo="${base}/api/logo?u=${encodeURIComponent(logo)}"`);
    attrs.push(`group-title="${group}"`);

    lines.push(`#EXTINF:-1 ${attrs.join(' ')},${name}`);
    // direct: true → el TV va directo al origen (canales sin bloqueo CORS/UA,
    // p. ej. Akamai que rechaza IPs de datacenter).
    if (isObject && value.direct) {
      lines.push(url);
    } else {
      lines.push(`${base}/api/proxy?id=${encodeURIComponent(id)}`);
    }
  }

  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'audio/x-mpegurl; charset=utf-8', 'Cache-Control': 'no-store' }
  });
};
