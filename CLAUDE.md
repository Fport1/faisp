# Cómo trabajar y probar en faisp

Notas para Claude (Claude Code) al trabajar en este proyecto. Las notas privadas del dueño (sus proyectos, rutas y
datos) están en `CLAUDE.local.md`, que no se sube al repositorio. La idea de fondo:
**no se prueba usando la app a mano: se prueba con un guion que se ejecuta solo y deja pruebas legibles** (salida de
la API, logs y capturas). Lo lento es esperar a una persona o ir clic a clic por la interfaz; eso hay que evitarlo.

## Cómo abordar cada petición

1. **Leer antes de tocar:** el código que afecta, cómo se hizo algo parecido y este archivo.
2. **Hacerlo todo y probar una vez al final.** El usuario prefiere que se implemente la lista entera, luego una pasada
   de pruebas y luego se arregle lo que salga. No hay que lanzar la app después de cada cambio.
3. **Compilar a menudo** (`cargo check`, rápido) mientras se escribe: pilla casi todos los fallos sin arrancar nada.
4. **Probar con un guion** (abajo), lanzado en segundo plano. Mientras corre, se hace otra cosa (documentar, README).
5. **Leer los resultados** (JSON y eventos de la API, log y capturas). Si algo no cuadra, **añadir un dato** (un log, un
   campo en la respuesta) antes de cambiar código a ciegas, y repetir solo esa prueba.
6. **Informar** de qué se probó, qué no (por ejemplo, con claves reales) y qué tiene que hacer el usuario.

## La regla más importante: instancia de prueba aislada

faisp es de instancia única: si el puerto 4317 ya está ocupado (el usuario suele tenerlo abierto), lanzar otro
`faisp.exe` **no arranca nada**: solo pide a la instancia abierta que abra una ventana. Para probar, siempre:

```bash
cargo build
```

```bash
target/debug/faisp.exe --headless --port 4399 --data "<carpeta temporal>"
```

- `--headless`: sin ventana, solo el servidor HTTP. Lanzarlo **en segundo plano**.
- `--port 4399`: otro puerto, para no chocar con la app del usuario.
- `--data` en una carpeta temporal nueva (el scratchpad): no toca `%APPDATA%\faisp` ni sus chats, claves o gasto.
- Compilar en **debug** para probar (`cargo build`); `--release` solo para entregar, porque con `lto` tarda mucho más.
- Sin claves en esa carpeta de datos, todos los agentes van en **modo demo**: el flujo completo funciona y no gasta nada.
  Así se prueba casi todo.

## Probar por la API, no por la interfaz

Todo lo que hace la UI pasa por la API local (`src/api.rs`), así que un guion con `curl` (o un `.mjs` con `fetch`)
prueba el orquestador entero en segundos:

```bash
curl -s -X POST http://127.0.0.1:4399/api/projects -H "Content-Type: application/json" -d "{\"name\":\"prueba\",\"path\":\"<carpeta de prueba>\"}"
```

```bash
curl -s -X POST http://127.0.0.1:4399/api/chats -H "Content-Type: application/json" -d "{\"project_id\":\"<id>\"}"
```

```bash
curl -s -N -X POST http://127.0.0.1:4399/api/chats/<id>/send -H "Content-Type: application/json" -d "{\"text\":\"...\",\"agent_id\":\"auto\",\"attachments\":[],\"mode\":\"\",\"effort\":\"\"}"
```

- `send` devuelve **eventos SSE** (`curl -N`): ahí se ve el plan, qué agente hace cada paso, el resultado, el coste y
  los errores. Basta con leerlo o filtrarlo; no hace falta mirar la ventana.
- Después, `GET /api/chats/<id>`, `/api/projects/<id>/blackboard`, `/api/artifacts` y `/api/usage` para comprobar el
  estado.
- Proyectos de prueba en una carpeta temporal con 2-3 archivos pequeños, nunca en carpetas reales del usuario (los
  agentes pueden escribir).

**`scripts/smoke.mjs`** junta esto: arranca instancias aisladas (puerto 4399, datos temporales, todo en modo demo),
ejecuta los pasos, imprime cada resultado con un prefijo fijo (`[smoke] ok ...` / `[smoke] FALLO ...`), cierra el
proceso y sale con código 1 si algo falla. Uso: `cargo build` y luego `node scripts/smoke.mjs todo` (o un escenario:
`agentes`, `chat`, `reparto`, `registro`) y `grep "\[smoke\]"`. Cuando se pida algo nuevo, añádele un paso o un escenario con nombre.
(El puerto 4398 suele estar ocupado por otro programa de este PC: no lo uses.)

## Probar la interfaz

- Con `FAISP_UI_DIR=ui` la UI se sirve desde la carpeta `ui/`: los cambios de HTML, CSS o JS **no necesitan
  recompilar**, basta con recargar.
- Abrir `http://127.0.0.1:4399` (la instancia aislada) en el navegador integrado de Claude Code y usar capturas o leer
  el texto de la página. La ventana nativa no hace falta para casi nada.
- Primero se comprueba **el estado con datos** (la API o un `console.log`) y después la imagen. Una captura sola puede
  engañar: puede ser un fotograma viejo o salir antes de que acabe la animación. Hay que dejar un pequeño margen entre la
  acción y la captura.

## Proveedores reales (lo que cuesta y tarda)

- Todo lo que no dependa del modelo se prueba en **modo demo**.
- Si hace falta una llamada real: una sola, en la **pasada final**, con el modelo más barato (Haiku o un `:free`) y
  respuestas cortas. `POST /api/providers/<id>/test` hace la petición mínima.
- Si se repiten pruebas con respuestas reales, conviene un **modo grabado**: guardar la respuesta real una vez y
  reproducirla desde archivo en las siguientes pruebas.
- No poner claves reales en la carpeta de datos de prueba sin que el usuario lo pida.

## Probar mods de Minecraft desde faisp (lo que hacen los agentes)

Cuando se pide en faisp "pruébalo en el juego" sobre un mod en desarrollo, lo que se quiere es esto, tal cual: **el
agente abre Minecraft con `gradlew runClient` y una escena automática, el juego entra directo al mundo, hace la prueba,
toma las capturas y se cierra; luego el agente lee el log y mira las fotos.** El procedimiento completo está en la skill
`<datos>/skills/probar-mods-minecraft.md`.

Las palabras "en el juego", "lanzar" y "partida" no deben mandar la petición al agente **Modpack Launcher**: no puede
usar `run_command` y abriría Minecraft desde el launcher. Por eso:

- **Código:** palabras clave de pruebas (probar, prueba, capturas, fotos, en el juego, runclient, gradlew...), la
  descripción dice que también prueba mods con `gradlew runClient`, el conector `gemini-media` para mirar las capturas
  con `analizar_medio_gemini`, y una nota en su instrucción.
- **Modpack Launcher:** sin "en el juego", "lanzar" ni "partida"; su descripción e instrucción dicen que **no** prueba
  mods en desarrollo y que eso le toca a Código.

Está en el código de faisp desde la 0.12.2, así que no se pierde al restablecer los agentes ni en otros PCs:

- Valores de fábrica: `src/defaults.rs` (agente `codigo`: palabras clave, descripción, `gemini-media`, instrucción
  `CODE_TEST`) y `src/integrations.rs` (`detect_modpack` crea el `launcher` sin esas palabras y con la excepción).
  La migración `v5` (`defaults::migrate`) lo aplica a configuraciones antiguas sin pisar lo que el usuario añadió.
- La skill viene con faisp: `assets/skills/probar-mods-minecraft.md` se instala en `<datos>/skills/` si falta y se
  actualiza si la copia es de una versión anterior (marca `<!-- incluida con faisp: vN -->`; súbele el número al
  cambiarla). Si el usuario la edita y quita la marca, no se pisa.
- `read_file` de una imagen (png/jpg/webp/gif, hasta 4,5 MB) devuelve una marca (`context::IMAGE_MARK`) que el
  proveedor de Anthropic convierte en un bloque de imagen: Claude ve la captura él mismo. Los proveedores sin visión
  reciben un aviso para usar `analizar_medio_gemini`. Claude Code (suscripción) ya veía imágenes con su `Read`.
- `run_command` acepta hasta 1800 s y su descripción pide compilar antes en otra llamada (`gradlew compileJava`).

`node scripts/smoke.mjs agentes` comprueba todo esto (valores de fábrica, migración, skill y que «prueba en el juego»
vaya a Código).

## Al acabar

- `cargo build --release` solo si se va a entregar o instalar (`scripts/install.ps1`).
- Parar la instancia de prueba y no dejar procesos `faisp.exe` colgados en el puerto 4399.
- Actualizar el README si cambia algo visible (opciones, comandos, limitaciones).
