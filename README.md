# faisp

Un orquestador multi-IA local con una interfaz al estilo de Claude. Le pides algo y un **orquestador** lo reparte entre **agentes especialistas**, cada uno con su propio modelo. Todos comparten una **pizarra de contexto** del proyecto y la app vigila cuántos **tokens** gastas.

- **Nativo y ligero:** un único `.exe` en Rust (~5 MB, ~10 MB de RAM). La interfaz se abre como ventana de app usando el WebView/Edge que ya trae Windows. No usa Electron.
- **Trabaja sobre tus carpetas:** los agentes pueden listar, leer, buscar y escribir archivos de tus proyectos. Las escrituras se guardan como propuestas, salvo que actives la escritura directa (que hace copia de seguridad).
- **Cada tarea al modelo que mejor la hace:** por ejemplo, los modelos 3D van a otra IA (Gemini u otra vía OpenRouter), la narrativa a Sonnet, el código a Opus y la planificación a Haiku.

## Arrancar

```bash
cargo build --release
```

```bash
target/release/faisp.exe
```

Para instalarlo en Windows, de modo que aparezca al buscar "faisp" en el menú Inicio:

```bash
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Con `-Desktop` también crea un acceso directo en el escritorio, y con `-Uninstall` lo desinstala. No necesita permisos de administrador: se instala en `%LOCALAPPDATA%\Programs\faisp`.

Al ejecutarlo se abre la ventana. Si vuelves a lanzarlo y ya está abierto, solo abre otra ventana. Cuando no queda ninguna ventana abierta y no hay rutinas activas, el proceso se cierra solo.

Opciones:
- `--headless`: solo servidor, sin abrir ventana.
- `--port 4317`: puerto en el que escucha.
- `--data <carpeta>`: carpeta de datos.

Para desarrollar la interfaz sin recompilar, define `FAISP_UI_DIR=ui`.

Mientras falte la clave de un proveedor, sus agentes funcionan en **modo demo**: no gastan y muestran cuánto contexto habrían recibido. Las claves se añaden en **Ajustes → Proveedores**. También sirven las variables de entorno `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, etc.

Los datos se guardan en `%APPDATA%\faisp`: `config.json`, `db.json`, `plugins/`, `skills/`, `backups/`.

## Proveedores y ahorro

| Proveedor | Para qué | Coste |
|---|---|---|
| Ollama | Local y privado | Gratis |
| Google Gemini (`gemini-4-hydrogen`, `gemini-3.8-flash`) | 3D, diseño, tareas generales | Tier gratuito |
| Groq (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`) | Tareas rápidas | Plan gratuito con límites |
| Cerebras | Tareas rápidas | Prueba gratuita |
| xAI Grok (`grok-4.7`) | Investigador con búsqueda web (Responses API) | De pago |
| Anthropic Claude (Opus, Sonnet, Haiku) | Código, razonamiento; búsqueda web propia | De pago |
| OpenRouter | Los modelos `:free` | Gratis |
| OpenRouter, OpenAI, Mistral, LiteLLM | Resto | Según proveedor |

- **Cadena de respaldo:** cada agente tiene un modelo principal y otros de respaldo. Si al principal le falta la clave, está saturado o falla, entra el siguiente.
- **Modo ahorro:** activable por agente o para todos. Prueba primero los modelos gratuitos o locales.
- **Comprobación de locales:** antes de usar Ollama o LiteLLM, faisp comprueba que responden.
- **Ver modelos:** en Ajustes, este botón lista lo que ofrece cada API, por si cambian los IDs.

## Web (Vercel)

```bash
node scripts/build-web.mjs
```

Esto genera `web/`, con la landing en `/` y la app en modo demo en `/app`. La demo usa una API simulada en el navegador: no usa claves ni accede a archivos.

Para publicarla:

```bash
cd web && vercel deploy --prod
```

Está publicada en https://faisp.vercel.app.

## Cómo funciona

```
petición → Orquestador (Haiku: planifica en JSON, barato)
         → pasos por agente; los que no dependen entre sí van en paralelo
         → cada agente recibe:
              [estable, cacheado]  sus instrucciones + ficha del proyecto + equipo
              [volátil]            memoria + pizarra (resúmenes de los demás) + resultados de pasos previos
                                   + skills relevantes + archivos/conectores pedidos
              [herramientas]       list_dir · read_file · search · write_file sobre la carpeta
         → su resultado se resume (0 tokens) y se añade a la pizarra que ven los demás
         → los archivos generados se guardan como artefactos versionados → "Aplicar" escribe en disco con copia
```

### Ahorro de tokens

- **Caché:** la parte estable del prompt se cachea, y en Claude la relectura cuesta ~10 % del precio normal.
- **Pizarra:** cada agente ve resúmenes de lo que hicieron los demás, no sus salidas completas.
- **Lectura bajo demanda:** los agentes leen los archivos que necesitan con herramientas, no reciben el proyecto entero.
- **Skills:** solo se inyectan cuando la tarea encaja con ellas.
- **Compresión:** cuando la pizarra crece, se condensa en una memoria del proyecto.
- **Modelo por tarea:** cada tarea va al modelo más barato que la resuelve bien.
- **Control de gasto:** límite mensual en USD y panel de uso por agente, modelo y proyecto.

## Extensiones

| Qué | Dónde | Formato |
|---|---|---|
| **Plugin** | `plugins/<id>/plugin.json` | `{ id, name, version, description, agents:[], connectors:[], routines:[] }` + `skills/*.md` |
| **Skill** | `skills/*.md` o dentro de un plugin | frontmatter `name, description, agents, keywords` + markdown |
| **Conector** | en `plugin.json` | `{"id":"docs","type":"folder","path":"C:/…/docs","keywords":"lore, roadmap"}`. Tipos: `folder`, `file`, `http` |
| **Rutina** | UI o `plugin.json` | `schedule`: `every:60`, `daily:09:00` o `manual` |
| **Agente** | UI o `plugin.json` | `{ id, name, icon, model:"proveedor:modelo", effort, description, keywords, system, tools }` |
| **Proveedor** | Ajustes | `anthropic`, o `openai` (cualquier `/chat/completions`: OpenRouter, LiteLLM, Ollama, Groq, DeepSeek…) |

Los modelos se escriben como `proveedor:modelo`, por ejemplo `anthropic:claude-opus-5-5`, `openrouter:google/gemini-2.5-pro` u `ollama:qwen2.5-coder`.

## Arquitectura

```
src/main.rs          arranque, instancia única, ventana de app, autocierre
src/api.rs           API HTTP local (127.0.0.1) + UI embebida
src/orchestrator.rs  estado, planificación, ejecución por oleadas, pizarra, coste
src/providers.rs     Anthropic (HTTP + streaming + herramientas + caché) y compatibles con OpenAI
src/context.rs       árbol del proyecto, herramientas de archivos, resúmenes, artefactos
src/extensions.rs    plugins, skills, conectores
src/routines.rs      programador de rutinas
ui/                  interfaz (HTML/CSS/JS sin framework)
```

## Limitaciones actuales

- Con claves reales solo se ha comprobado que compila; el flujo completo se ha probado en modo demo.
- La ventana usa Edge/Chrome en "modo app". Para tener instalador, icono en la bandeja e integración nativa total, el siguiente paso es envolverlo con Tauri.
- Todavía no hay cliente MCP. Tampoco se conectan los "bots" propios de cada plataforma (Assistants de OpenAI, Gems, Projects de Claude…); hoy se integran como agentes que apuntan a su modelo.
- Los agentes no pueden ejecutar comandos (como `gradlew build`). Si se añade, debería pedir aprobación en la UI.
