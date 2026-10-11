import canales from './_canales.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });

const text = (status, contentType, body) =>
  new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': contentType, 'Cache-Control': 'no-store' }
  });

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(405, { error: 'Método no permitido. Usa GET.' });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const relPath = url.searchParams.get('path');
  const entry = id ? canales[id] : undefined;
  const channelUrl = typeof entry === 'object' && entry !== null ? entry.url : entry;

  if (!channelUrl) {
    return json(404, { error: 'Identificador de canal no encontrado' });
  }

  // Modo "todo por el proxy": ?path= resuelve un recurso relativo (variante o
  // segmento) contra la carpeta del manifiesto del canal. Todo el tráfico del
  // canal pasa por Netlify (cert DigiCert, la única CA que el webOS confía).
  let targetUrl;
  try {
    targetUrl = relPath
      ? new URL(relPath, new URL('.', channelUrl)).toString()
      : channelUrl;
  } catch {
    return json(400, { error: 'path inválido' });
  }

  const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return json(upstream.status, { error: `Error en el servidor de origen (HTTP ${upstream.status})` });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isManifest =
      contentType.includes('mpegurl') || targetUrl.split('?')[0].endsWith('.m3u8');

    if (!isManifest) {
      const buffer = await upstream.arrayBuffer();
      return new Response(buffer, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'no-store'
        }
      });
    }

    const data = await upstream.text();

    // Modo híbrido: el master (y cualquier manifiesto) se sirve por el proxy
    // para inyectar CORS y eliminar content steering, pero las URIs de
    // variantes y segmentos se resuelven a URLs ABSOLUTAS del origen, de modo
    // que el video no consume ancho de banda del proxy.
    const modifiedPlaylist = data
      .split('\n')
      .map((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return '';
        if (trimmedLine.startsWith('#EXT-X-CONTENT-STEERING')) return '';
        if (trimmedLine.startsWith('#')) return trimmedLine;

        try {
          return new URL(trimmedLine, targetUrl).toString();
        } catch {
          return trimmedLine;
        }
      })
      .filter((line) => line !== '')
      .join('\n');

    return text(200, 'application/vnd.apple.mpegurl', modifiedPlaylist);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return json(504, { error: 'Timeout: el servidor de origen no respondió a tiempo' });
    }
    return json(502, { error: 'Fallo interno procesando el stream' });
  }
};
