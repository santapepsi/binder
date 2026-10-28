# Binder

Binder 3D para la colección de Yu-Gi-Oh!, en web y Android (APK). Páginas de 9 bolsillos (3×3), un binder por tipo de carta más dos personales, y cuenta opcional para sincronizar entre dispositivos. La interfaz está en inglés.

## Qué hace

- **Modelo 3D**: mesa de madera, tapas, anillas, hojas de plástico con 9 bolsillos y las cartas dentro. Paso de página con curva simple, apertura y cierre de la tapa.
- **Binders**: Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link, Pendulum (todos los péndulos juntos), Spells, Traps y dos personales. Al agregar una carta a un binder de tipo, va sola al binder que le corresponde; en los personales va donde elijas. Skills y tokens van al primer binder personal.
- **Páginas infinitas**: siempre queda una página vacía al final.
- **Cada copia** guarda set y rareza, artwork (si la carta tiene varios), estado, idioma, edición (1st / Unlimited / Limited) y notas. El bolsillo muestra ese artwork con una etiqueta de rareza.
- **Mover cartas**: arrastrar con el mouse, o mantener pulsado en pantallas táctiles. Mantener la carta en el borde de la página la da vuelta.
- **Tapas** al estilo de los binders de 9 bolsillos: color liso y el nombre abajo a la izquierda (se puede ocultar). Colores por tipo: Xyz negro, Synchro blanco, Link y Ritual azul, Effect y Normal rojo, Pendulum y Spells verde, Fusion violeta, Traps rosa; Personal I negro y Personal II blanco. Se cambian con el selector HEX, los colores rápidos o una imagen.
- **Letra de la tapa**: en Settings → Cover lettering se carga un archivo de fuente (.ttf/.otf). Queda en el dispositivo y en la cuenta (privado), no se publica con la app.
- **Sin conexión**: binders, cartas, base de cartas e imágenes quedan guardados en el dispositivo.
- **Cuenta y sincronización** (opcional) con Supabase.
- **Deckboxes**: desde el menú de arriba a la izquierda (Binders / Deckboxes) se crean mazos. El editor imita la pantalla de mazos de Tag Force: pestañas Deck, Extra, Side y Binders (todas las cartas de todos los binders y de la mesa). Máximo 3 copias por carta y no más de las que tenés; Fusion, Synchro, Xyz y Link van al Extra solas. Se exportan como .ydk y se sincronizan con la cuenta.
- **Stickers de rareza**: se muestran u ocultan todos con el botón de la barra, o de a uno desde el panel de la carta.

Teclado: ← → pasan página, Inicio / Fin van a la primera / última, Esc deselecciona.

## Base de cartas (todas, ~14.600)

La primera vez que agregás una carta, la app descarga la base completa (una copia de la de YGOPRODeck que GitHub Actions actualiza cada día y publica junto a la web, en `data/cards.json`; si no está disponible, la pide directo a YGOPRODeck): textos, stats, sets y rarezas, y los artworks de cada carta (unos 20 MB, una sola vez). Queda guardada en el dispositivo, así que buscar funciona sin conexión. Una vez por día, si hay conexión, la app consulta si YGOPRODeck publicó una versión nueva y la actualiza. También se puede actualizar a mano en **Settings → Card database**.

## Imágenes

Solo se descargan las imágenes de las cartas que agregás. En el diálogo de agregar se ve solo el nombre; la imagen se descarga cuando la carta ya está en el binder, una sola vez, y queda guardada para verla siempre, también sin conexión. Mientras se descarga, el bolsillo muestra el nombre; si no hay conexión, una carta genérica dibujada, y la descarga se reintenta al volver la conexión.

YGOPRODeck no permite que un navegador descargue sus imágenes desde otra web (CORS):

- **Android**: el APK las descarga directo con HTTP nativo. No hace falta nada más.
- **Web**: hace falta la función `card-image` de Supabase, que copia cada imagen una sola vez al bucket público `card-images` de tu proyecto (los demás dispositivos leen esa copia). Ver "Cuenta" abajo.

## Uso

- **Android**: cada push a `main` compila un APK y lo sube al release [`android-latest`](https://github.com/santapepsi/binder/releases/tag/android-latest). Se instala directo en el teléfono (permitir instalar desde esa fuente). Las actualizaciones se instalan encima sin perder los datos, porque se firman siempre con la misma clave de depuración (`android-config/debug.keystore`; para distribuir la app a otras personas habría que crear una clave propia).
- **Web**: se publica en GitHub Pages en cada push a `main` (https://santapepsi.github.io/binder/) una vez activado Pages en Settings → Pages → Source: GitHub Actions.

## Cuenta (Supabase)

1. Crear un proyecto gratuito en supabase.com.
2. En el SQL editor, ejecutar [`supabase/schema.sql`](supabase/schema.sql): tablas, seguridad por usuario, bucket privado para las tapas y bucket público `card-images`.
3. Para las imágenes en la web, instalar la función:
   ```bash
   npx supabase login
   npx supabase functions deploy card-image --no-verify-jwt --project-ref TU_PROJECT_REF
   ```
   O desde el panel: Edge Functions → Create function, nombre `card-image`, pegar `supabase/functions/card-image/index.ts` y desactivar "Verify JWT".
4. Para uso personal, en Authentication se puede desactivar la confirmación por email.
5. La app ya trae la URL y la clave pública del proyecto del binder (`src/data/settings.ts`): en **Settings → Account & sync** solo hay que crear la cuenta o iniciar sesión. Para usar otro proyecto, se cambian ahí o en ese archivo.

Cualquiera que instale la app puede crear su propia cuenta en este proyecto; cada cuenta ve solo sus binders. Para que nadie más se registre: Authentication → Sign In / Providers → desactivar "Allow new users to sign up" (después de crear tu cuenta).

Conflictos: gana el último cambio de cada carta; si dos dispositivos ponen cartas distintas en el mismo bolsillo, la más reciente pasa al primer bolsillo libre.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 (recargar la página tras cada cambio)
npm run typecheck
npm test
npm run build      # dist/
```

Prueba en navegador con capturas, usando la base de prueba `tests/fixtures/cardinfo.json`:

```bash
npm run build && cp tests/fixtures/cardinfo.json dist/
(cd dist && python3 -m http.server 8765 &)
node scripts/screenshot.mjs http://localhost:8765/ screenshots
```

Android local (requiere Android SDK y Java 21):

```bash
npm run build && npx cap add android && node scripts/android-patch.mjs && npx cap sync android
cd android && ./gradlew assembleDebug
```

Estructura: `src/model` (tipos, clasificación por binder, artworks, páginas), `src/data` (IndexedDB, base de cartas, imágenes, estado), `src/three` (escena 3D), `src/ui` (paneles y diálogos), `src/sync` (cuenta y sincronización).

## Créditos

Textos, datos e imágenes de cartas de YGOPRODeck. Yu-Gi-Oh! es marca de Konami; esta app no está afiliada a Konami. Fuente Nunito bajo SIL Open Font License (`src/assets/fonts/OFL-Nunito.txt`).
