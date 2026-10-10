// Fuente única de canales: importa el canales.json canónico de la raíz.
// Netlify (esbuild) lo inlinea en el bundle en build time, así que editar
// canales.json + push es suficiente para actualizar los canales.
import canales from '../../canales.json' with { type: 'json' };

export default canales;
