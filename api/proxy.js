import canales from '../canales.json' with { type: 'json' };

export default async function handler(req, res) {
  // Inyectar cabeceras CORS para webOS (evita que el reproductor aborte la reproducción)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Usa GET.' });
  }

  // Capturar el ID del canal desde la URL (ej: /api/proxy?id=canal_prueba)
  const { id } = req.query;
  const targetUrl = typeof id === 'string' ? canales[id] : undefined;

  if (!targetUrl) {
    return res.status(404).json({ error: 'Identificador de canal no encontrado en canales.json' });
  }

  const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

  try {
    // Evita que la función quede colgada si el origen no responde
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    // Bypass del User-Agent frente al firewall del origen
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Error en el servidor de origen (HTTP ${upstream.status})`
      });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isManifest =
      contentType.includes('mpegurl') || targetUrl.split('?')[0].endsWith('.m3u8');

    // Modo binario: segmentos/otros recursos pasan tal cual (sin reescritura).
    // No se copia content-encoding porque fetch ya descomprime la respuesta.
    if (!isManifest) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buffer);
    }

    const data = await upstream.text();

    // Reescritura de segmentos a rutas absolutas apuntando al dominio original
    const modifiedPlaylist = data
      .split('\n')
      .map((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#') && !trimmedLine.startsWith('http')) {
          return baseUrl + trimmedLine;
        }
        return trimmedLine;
      })
      .join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(modifiedPlaylist);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout: el servidor de origen no respondió a tiempo' });
    }
    res.status(502).json({ error: 'Fallo interno procesando el stream' });
  }
}
