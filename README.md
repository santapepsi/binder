# Binder

Binder 3D para la colección de Yu-Gi-Oh!, en web y Android (APK). Páginas de 9 bolsillos (3×3), un binder por tipo de carta más dos personales, y cuenta opcional para sincronizar entre dispositivos. La interfaz está en inglés.

El catálogo de cartas (datos e imágenes) se lee de **Cardmática** en modo solo lectura; el binder nunca escribe en Cardmática. Sin servidor configurado se usa un catálogo de demostración pequeño incluido en la app.

## Qué hace

- **Modelo 3D**: mesa de madera, tapas, anillas, hojas de plástico con 9 bolsillos y las cartas dentro. Paso de página con curva simple, apertura y cierre de la tapa.
- **Binders**: Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link, Pendulum (todos los péndulos juntos), Spells, Traps y dos personales. Al agregar una carta a un binder de tipo, va sola al binder que le corresponde; en los personales va donde elijas.
- **Páginas infinitas**: siempre queda una página vacía al final.
- **Cada copia** guarda set y rareza (de las impresiones de Cardmática, o a mano), artwork (si la carta tiene varios), estado, idioma, edición (1st / Unlimited / Limited) y notas. El bolsillo muestra la imagen de ese artwork con una etiqueta de rareza.
- **Imágenes**: al agregar una carta solo se ve su nombre; la imagen se descarga de YGOPRODeck cuando la carta ya está en el binder, una sola vez, y queda guardada en el dispositivo. Solo se descargan las cartas que agregás.
- **Mover cartas**: arrastrar con el mouse, o mantener pulsado en pantallas táctiles. Mantener la carta en el borde de la página la da vuelta.
- **Tapas**: color hex o una imagen (JPG, PNG, WebP, GIF).
- **Sin conexión**: binders, cartas e imágenes se guardan en el dispositivo (IndexedDB). Solo hace falta conexión para buscar y agregar cartas.
- **Cuenta y sincronización** (opcional) con Supabase: los cambios se guardan primero en el dispositivo y se sincronizan al volver la conexión.

Teclado: ← → pasan página, Inicio / Fin van a la primera / última, Esc deselecciona.

## Uso

- **Web**: se publica en GitHub Pages en cada push a `main` (https://santapepsi.github.io/binder/).
- **Android**: cada push a `main` compila un APK y lo sube al release [`android-latest`](https://github.com/santapepsi/binder/releases/tag/android-latest). Se instala directo en el teléfono (permitir instalar desde esa fuente). Las actualizaciones se instalan encima sin perder los datos, porque todas se firman con la misma clave de depuración (`android-config/debug.keystore`; para distribuir la app a otras personas habría que crear una clave propia).

## Catálogo completo (las ~14.000 cartas)

Los textos y datos de todas las cartas los mantiene Cardmática. Para cargarlas todas, en el entorno de Cardmática (con `YGOPRODECK_ENABLED=true`):

```bash
cardmatica sync ygoprodeck initial --max-cards 100000
# con Docker:
docker compose exec api cardmatica sync ygoprodeck initial --max-cards 100000
```

Si se interrumpe, `cardmatica resume UUID_DEL_TRABAJO --max-cards 100000`. Para sumar cartas nuevas más adelante: `cardmatica sync ygoprodeck incremental --max-cards 100000`. Cardmática guarda también los artworks alternativos de cada carta, y el binder los ofrece al agregarla.

## Imágenes de las cartas

YGOPRODeck no permite que un navegador descargue sus imágenes desde otra web (CORS), así que:

- **Android**: el APK las descarga directo con HTTP nativo. No necesita nada más.
- **Web**: hace falta la función `card-image` de Supabase, que copia cada imagen una sola vez al bucket público `card-images` de tu proyecto. Así además YGOPRODeck no recibe pedidos repetidos y los demás dispositivos leen la copia del bucket.

Para instalar la función (después de ejecutar `supabase/schema.sql`, que crea el bucket):

```bash
npx supabase login
npx supabase functions deploy card-image --no-verify-jwt --project-ref TU_PROJECT_REF
```

O desde el panel de Supabase: Edge Functions → Create function, nombre `card-image`, pegar `supabase/functions/card-image/index.ts` y desactivar "Verify JWT".

Sin conexión o si una descarga falla, el bolsillo muestra una carta genérica dibujada y la descarga se reintenta al volver la conexión.

## Conectar con Cardmática

En la app: **Settings → Card catalog → Cardmática server**, con la dirección del backend (por ejemplo `http://192.168.1.20:8000`), y **Test** para comprobarla.

Del lado de Cardmática hacen falta dos ajustes en su `.env` (no requieren cambios de código):

1. **CORS**: agregar los orígenes del binder a `CORS_ORIGINS`:
   ```
   CORS_ORIGINS=["http://localhost:8000","http://localhost:5500","https://santapepsi.github.io","https://localhost","http://localhost:5173"]
   ```
   `https://localhost` es el origen de la app Android y `http://localhost:5173` el del servidor de desarrollo.
2. **Acceso desde el teléfono**: el `docker-compose.yml` de Cardmática publica la API solo en `127.0.0.1`. Para que el teléfono la alcance, la API tiene que escuchar en la red local (o estar desplegada en un servidor).

Un límite a tener en cuenta:

- **Web en GitHub Pages + Cardmática por `http://`**: el navegador bloquea pedidos `http://` desde una página `https://`. Para la versión web hace falta Cardmática por `https://`, o usar el servidor de desarrollo local. La app Android sí permite `http://`.

## Cuenta (Supabase)

1. Crear un proyecto gratuito en supabase.com.
2. En el SQL editor, ejecutar [`supabase/schema.sql`](supabase/schema.sql) (tablas, seguridad por usuario y bucket privado para las tapas).
3. Para uso personal, en Authentication se puede desactivar la confirmación por email.
4. En la app: **Settings → Account & sync**, pegar la URL del proyecto y la clave pública (anon / publishable), y crear la cuenta o iniciar sesión.

Conflictos: gana el último cambio de cada carta; si dos dispositivos ponen cartas distintas en el mismo bolsillo, la más reciente pasa al primer bolsillo libre.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 con recarga
npm run typecheck
npm test
npm run build      # dist/
node scripts/screenshot.mjs http://localhost:8765/ screenshots   # prueba en navegador con capturas
```

Android local (requiere Android Studio / SDK y Java 21):

```bash
npm run build && npx cap add android && node scripts/android-patch.mjs && npx cap sync android
cd android && ./gradlew assembleDebug
```

Estructura: `src/model` (tipos, clasificación por binder, cálculo de páginas), `src/data` (IndexedDB, catálogo, imágenes, estado), `src/three` (escena 3D), `src/ui` (paneles y diálogos), `src/sync` (cuenta y sincronización).

## Créditos

Datos e imágenes de cartas vía Cardmática, que los mantiene desde YGOPRODeck. Yu-Gi-Oh! es marca de Konami; esta app no está afiliada a Konami. Fuente Nunito bajo SIL Open Font License (`src/assets/fonts/OFL-Nunito.txt`).
