# Muscules

Prototipo web del juego Muscules, con pantalla de inicio, perfil, inventario y un combate de prueba.

## Publicar en GitHub Pages

El workflow de GitHub Actions publica automáticamente el sitio cuando hay un `push` a `main` o `master`.

1. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como método de publicación.
2. Cada `push` a `main` inicia el workflow **Deploy static site to GitHub Pages**.
3. La URL del sitio aparece en **Settings → Pages** o en el resultado del workflow.

También puedes iniciar una publicación manual desde **Actions → Deploy static site to GitHub Pages → Run workflow**. El workflow requiere las variables de Actions `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Para correr las pruebas, usa `npm test`; Playwright reemplaza Supabase por un adaptador simulado.

Perfil e Inventario están conectados desde el menú principal. Encuentro sigue siendo provisional. `combate.html` contiene un combate local de demostración; su progreso se guarda en el navegador y aún no se sincroniza con Supabase.

## Supabase Auth y diagnóstico remoto

El sitio usa Supabase Auth y, en esta fase, únicamente lee el rol y `game_state` (`neo_main`). Las estadísticas locales y las mecánicas del juego no se migran ni se escriben en Supabase.

Para GitHub Pages, configura las variables públicas del repositorio `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en **Settings → Secrets and variables → Actions → Variables**. El workflow genera `supabase-config.js` al desplegar. La clave publishable/anon se entrega al navegador y no es una clave secreta; nunca configures `service_role` ni una clave secreta en estas variables.

Para desarrollo local, exporta esas mismas variables y ejecuta:

```sh
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
node scripts/generate-supabase-config.js
node tests/serve.js
```

Luego abre `http://127.0.0.1:4173/login.html`. El archivo generado `supabase-config.js` está ignorado por Git. En Supabase Auth, agrega el origen local y el URL de GitHub Pages a los URLs de redirección permitidos. El diagnóstico está disponible en `diagnostico.html`; Cherry y Neo deben iniciar sesión por separado para comprobar sus lecturas. Playwright usa un adaptador simulado, sin credenciales ni consultas reales.

## Estructura
- `index.html`: pantalla y navegación
- `styles.css`: estilos responsive
- `script.js`: interacciones provisionales
- `perfil.html` y `perfil.css`: pantalla de perfil
- `inventario.html`, `inventario.css`, `inventario.js` y `inventory-data.js`: inventario
- `combate.html`, `combate.css` y `combate.js`: combate de demostración
- `assets/`: imágenes originales seleccionadas del paquete de diseño
