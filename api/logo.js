const ALLOWED_HOSTS = new Set([
  'i.imgur.com', 'i.ibb.co', 'iili.io', 'upload.wikimedia.org',
  'www.vivalivetv.com', 'www.ultralaradio.mx'
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const target = typeof req.query?.u === 'string' ? req.query.u : undefined;
  if (!target) {
    return res.status(400).json({ error: 'Falta parámetro u' });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: 'Host no permitido' });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method: req.method,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Origen HTTP ${upstream.status}` });
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buffer);
  } catch {
    return res.status(502).json({ error: 'Fallo interno procesando el logo' });
  }
}