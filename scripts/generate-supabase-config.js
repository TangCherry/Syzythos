const fs = require('node:fs');
const path = require('node:path');

const url = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
if (!url || !publishableKey) {
  throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY antes de generar la configuración.');
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch (error) {
  throw new Error('SUPABASE_URL no es una URL válida.', { cause: error });
}
if (parsedUrl.protocol !== 'https:') {
  throw new Error('SUPABASE_URL debe usar HTTPS.');
}

let isLegacyAnonKey = false;
if (publishableKey.startsWith('sb_secret_')) {
  throw new Error('Se rechazó una clave secreta; usa una clave publishable o anon.');
}
if (publishableKey.startsWith('eyJ')) {
  try {
    const payload = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString('utf8'));
    isLegacyAnonKey = payload.role === 'anon';
    if (payload.role === 'service_role') {
      throw new Error('Se rechazó service_role; nunca se permite en el frontend.');
    }
  } catch (error) {
    if (error.message.includes('service_role')) throw error;
    throw new Error('La clave JWT debe ser una clave anon válida.', { cause: error });
  }
}
if (!publishableKey.startsWith('sb_publishable_') && !isLegacyAnonKey) {
  throw new Error('La clave debe tener formato publishable o anon; no uses claves privadas.');
}

const config = { url: parsedUrl.origin, publishableKey };
const output = `window.MUSCULES_SUPABASE_CONFIG = Object.freeze(${JSON.stringify(config)});\n`;
const outputPath = path.resolve(__dirname, '..', 'supabase-config.js');
fs.writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o644 });
console.log(`Configuración pública de Supabase generada en ${outputPath}.`);
