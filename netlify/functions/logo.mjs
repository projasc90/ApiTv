// Proxy de logos: sirve imágenes de imgur/ibb/etc a través de Netlify,
// cuyo certificado DigiCert sí es confiable para el player de webOS 4.x
// (imgur usa Sectigo/USERTrust, que el TV rechaza).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};

const ALLOWED_HOSTS = new Set([
  'i.imgur.com', 'i.ibb.co', 'iili.io', 'upload.wikimedia.org',
  'www.vivalivetv.com', 'www.ultralaradio.mx'
]);

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get('u');

  if (!target) {
    return new Response(JSON.stringify({ error: 'Falta parámetro u' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  let parsed;
  try { parsed = new URL(target); } catch {
    return new Response(JSON.stringify({ error: 'URL inválida' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  // Solo hosts de logos conocidos (evita que la función sea un proxy abierto)
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'Host no permitido' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' }
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Origen HTTP ${upstream.status}` }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const buffer = await upstream.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      // Los logos son estáticos: cacheable 1 día en el edge del TV
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
