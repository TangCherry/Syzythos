import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const OUTPUT_DIR = path.join(DIST_DIR, 'pages');
const PRODUCTION_SUPABASE_ORIGIN = 'https://kooaebewhqljmqzkqrgr.supabase.co';

const ALLOWED_FILES = [
  'index.html',
  'login.html',
  'diagnostico.html',
  'dm.html',
  'dm-perfil.html',
  'dm-inventario.html',
  'dm-encuentro.html',
  'perfil.html',
  'inventario.html',
  'combate.html',
  'auth-guard.js',
  'combate-remote.js',
  'diagnostico.js',
  'dm-encuentro.js',
  'dm-inventario.js',
  'dm-perfil.js',
  'enemies.js',
  'inventario.js',
  'inventory-data.js',
  'login.js',
  'neo-stats-lock.js',
  'perfil.js',
  'script.js',
  'supabase-client.js',
  'auth.css',
  'combate.css',
  'dm.css',
  'home-auth.css',
  'inventario.css',
  'login.css',
  'perfil.css',
  'styles.css',
  'assets/armadura.png',
  'assets/background.jpg',
  'assets/botas.png',
  'assets/capa.png',
  'assets/cards/bola-de-cristal.png',
  'assets/cards/encendedor-arcoiris.png',
  'assets/cards/fuego-en-la-espada.png',
  'assets/cards/galleta-de-conejo-moreno.png',
  'assets/cards/gatito-fantasma.png',
  'assets/cards/gusanito.png',
  'assets/cards/llave-de-fuga.png',
  'assets/cards/maaake-up.png',
  'assets/cards/ojo-cosmico.png',
  'assets/cards/pocima-de-la-cumbia.png',
  'assets/cards/pocion-de-la-morision.png',
  'assets/cards/sherma.png',
  'assets/cards/stirfry.png',
  'assets/cards/totem-maldito.png',
  'assets/cards/vida-extra.png',
  'assets/cards/¿miau?.png',
  'assets/cherry-fondo-inicio.jpeg',
  'assets/cherry.png',
  'assets/combate/bosque.jpg',
  'assets/combate/carrotnero.png',
  'assets/combate/chispa.png',
  'assets/combate/derrota.png',
  'assets/combate/victoria.png',
  'assets/copiar.png',
  'assets/encounter.png',
  'assets/enemies/apostol.png',
  'assets/enemies/bola-vampiro.png',
  'assets/enemies/buho-musgo.png',
  'assets/enemies/carrotñero.png',
  'assets/enemies/diablillos.png',
  'assets/enemies/duendecillo-ropa-xp.png',
  'assets/enemies/fantasma-chupador.png',
  'assets/enemies/kitty-hongo.png',
  'assets/enemies/lapida-llorona.png',
  'assets/enemies/lazy-slime.png',
  'assets/enemies/mimic.png',
  'assets/enemies/mini-demonio.png',
  'assets/enemies/nega-neo.png',
  'assets/enemies/ojo-piojo.png',
  'assets/enemies/pescado-a-la-hoja-de-ajo.png',
  'assets/enemies/petunia-la-devoradora.png',
  'assets/enemies/ramamiro.png',
  'assets/enemies/robapache.png',
  'assets/enemies/triangulon.png',
  'assets/enemies/void.png',
  'assets/espada.png',
  'assets/exit.png',
  'assets/fondo-cherry.jpeg',
  'assets/fondo-inventario.jpg',
  'assets/inventory.png',
  'assets/items/bola-de-cristal.png',
  'assets/items/close.png',
  'assets/items/encendedor-de-arcoiris.png',
  'assets/items/fuego-en-la-espada.png',
  'assets/items/galleta-de-conejo-moreno.png',
  'assets/items/gatito-fantasma.png',
  'assets/items/gusanito.png',
  'assets/items/inventory-button.png',
  'assets/items/llave-de-fuga.png',
  'assets/items/maaaake-up.png',
  'assets/items/ojo-cosmico.png',
  'assets/items/pocima-de-la-morision.png',
  'assets/items/pocion-de-la-cumbia.png',
  'assets/items/sherma.png',
  'assets/items/stirfry.png',
  'assets/items/totem-maldito.png',
  'assets/items/vida-extra.png',
  'assets/items/¿miau?.png',
  'assets/lapiz.png',
  'assets/login-fondo.jpeg',
  'assets/neo icono.png',
  'assets/neo-perfil.jpeg',
  'assets/neo.png',
  'assets/sparkle.png',
  'assets/swords.png',
  'assets/trash.png'
];

function assertProductionUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} no es una URL válida.`);
  }
  if (url.origin !== PRODUCTION_SUPABASE_ORIGIN || url.pathname !== '/'
    || url.search || url.hash || url.username || url.password) {
    throw new Error(`${label} no apunta al proyecto Syzythos de producción.`);
  }
  return url.origin;
}

function readGeneratedConfig() {
  const configPath = path.join(ROOT, 'supabase-config.js');
  if (!existsSync(configPath)) {
    throw new Error('No existe supabase-config.js; genera la configuración con GitHub Actions primero.');
  }
  const source = readFileSync(configPath, 'utf8').trim();
  const prefix = 'window.MUSCULES_SUPABASE_CONFIG = Object.freeze(';
  const suffix = ');';
  if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
    throw new Error('supabase-config.js tiene un formato inesperado.');
  }

  let config;
  try {
    config = JSON.parse(source.slice(prefix.length, -suffix.length));
  } catch {
    throw new Error('supabase-config.js no contiene configuración JSON válida.');
  }
  const actionOrigin = assertProductionUrl(process.env.SUPABASE_URL || '', 'SUPABASE_URL');
  const configOrigin = assertProductionUrl(config?.url || '', 'La URL generada');
  if (configOrigin !== actionOrigin) {
    throw new Error('La configuración generada no coincide con SUPABASE_URL.');
  }

  const key = config?.publishableKey;
  if (typeof key !== 'string' || !key || key.startsWith('sb_secret_')) {
    throw new Error('supabase-config.js no contiene una clave pública válida.');
  }
  if (key.startsWith('eyJ')) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    } catch {
      throw new Error('La clave JWT generada no es válida.');
    }
    if (payload.role !== 'anon') {
      throw new Error('La clave generada no es una clave anon pública.');
    }
  } else if (!key.startsWith('sb_publishable_')) {
    throw new Error('La clave generada no es publishable ni anon.');
  }
  return configPath;
}

function assertSourceFilesExist() {
  for (const file of ALLOWED_FILES) {
    const sourcePath = path.join(ROOT, file);
    if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile()) {
      throw new Error(`Falta un archivo permitido requerido por el sitio: ${file}`);
    }
  }
}

function collectFiles(directory, relative = '') {
  const files = [];
  for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`El sitio no permite enlaces simbólicos: ${child}`);
    }
    if (entry.isDirectory()) files.push(...collectFiles(directory, child));
    else if (entry.isFile()) files.push(child.split(path.sep).join('/'));
    else throw new Error(`Tipo de archivo no permitido en el sitio: ${child}`);
  }
  return files;
}

function resolveReference(fromFile, reference) {
  const value = reference.trim();
  if (!value || value.startsWith('#')
    || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return null;

  let relative = value.split('#', 1)[0];
  if (!relative.startsWith('assets/')) relative = relative.split('?', 1)[0];
  relative = relative.replace(/^\/+/, '');
  const resolved = path.resolve(OUTPUT_DIR, path.dirname(fromFile), relative);
  if (resolved !== OUTPUT_DIR && !resolved.startsWith(`${OUTPUT_DIR}${path.sep}`)) {
    throw new Error(`Referencia local fuera del sitio en ${fromFile}: ${value}`);
  }
  return path.relative(OUTPUT_DIR, resolved).split(path.sep).join('/');
}

function verifyReferences() {
  const localReferences = [];
  for (const file of collectFiles(OUTPUT_DIR)) {
    if (!/\.(?:html|css|js)$/i.test(file)) continue;
    const source = readFileSync(path.join(OUTPUT_DIR, file), 'utf8');
    let references = [];
    if (file.endsWith('.html')) {
      references = [...source.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)]
        .map(match => match[2]);
    } else if (file.endsWith('.css')) {
      references = [
        ...[...source.matchAll(/url\(\s*([^)]*?)\s*\)/gi)].map(match => match[1].trim().replace(/^["']|["']$/g, '')),
        ...[...source.matchAll(/@import\s+["']([^"']+)["']/gi)].map(match => match[1])
      ];
    } else {
      references = [
        ...[...source.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)]
          .map(match => match[1] || match[2]),
        ...[...source.matchAll(/assets\/[^"'\s)]+/g)].map(match => match[0])
      ];
    }

    for (const reference of references) {
      const target = resolveReference(file, reference);
      if (target) localReferences.push([file, target]);
    }
  }

  for (const [source, target] of localReferences) {
    if (!existsSync(path.join(OUTPUT_DIR, target))) {
      throw new Error(`Referencia local no resuelta: ${source} -> ${target}`);
    }
  }
}

function assertExactOutput(configPath) {
  const expected = new Set([...ALLOWED_FILES, 'supabase-config.js']);
  const actual = new Set(collectFiles(OUTPUT_DIR));
  const missing = [...expected].filter(file => !actual.has(file));
  const unexpected = [...actual].filter(file => !expected.has(file));
  if (missing.length || unexpected.length) {
    throw new Error([
      missing.length ? `Faltan archivos: ${missing.join(', ')}` : '',
      unexpected.length ? `Archivos no permitidos: ${unexpected.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }
  if (!existsSync(configPath)) throw new Error('No se pudo validar la configuración generada.');
}

const configPath = readGeneratedConfig();
assertSourceFilesExist();

if (existsSync(DIST_DIR) && lstatSync(DIST_DIR).isSymbolicLink()) {
  throw new Error('dist no puede ser un enlace simbólico.');
}
if (existsSync(OUTPUT_DIR)) {
  if (lstatSync(OUTPUT_DIR).isSymbolicLink() || !lstatSync(OUTPUT_DIR).isDirectory()) {
    throw new Error('dist/pages debe ser un directorio normal de salida.');
  }
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUTPUT_DIR, { recursive: true });

for (const file of ALLOWED_FILES) {
  const destination = path.join(OUTPUT_DIR, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(ROOT, file), destination);
}
copyFileSync(configPath, path.join(OUTPUT_DIR, 'supabase-config.js'));

verifyReferences();
assertExactOutput(configPath);
console.log(`Pages site assembled with ${ALLOWED_FILES.length + 1} allowlisted files.`);
