---
name: probar-mods-minecraft
description: Cómo probar un mod de Minecraft en desarrollo: abrir Minecraft directo con gradlew runClient, escenas automáticas, capturas y revisión. NUNCA con un launcher.
agents: codigo, launcher, revisor
keywords: probar, prueba, pruebas, pruébalo, pruebalo, testea, test, capturas, captura, foto, fotos, en el juego, abre minecraft, runclient, gradlew, escena, ver cómo queda, comprobar
---
# Probar un mod en desarrollo: así, tal cual

El usuario quiere que pruebes tú: abres Minecraft, el juego hace solo lo que hay que probar, toma las fotos y se cierra;
después lees el resultado y miras las fotos. **No le pidas que abra el juego ni que haga nada.**

## Prohibido

- **No uses un launcher** (ni herramientas de un launcher para lanzar instancias, como las del Modpack Launcher) para
  probar un mod que se está desarrollando. El launcher es para la instancia ya instalada del usuario, no para probar
  cambios.
- No copies el `.jar` a la instancia para probar ni hagas `gradlew build` para eso.
- No abras el juego sin escena: se quedaría abierto esperando a una persona.

## El procedimiento

Todo con la herramienta `run_command`, en la carpeta del proyecto del mod. En los ejemplos, `<modid>` es el id del mod
(el de `fabric.mod.json` o `mods.toml`) y `<paquete>` su paquete Java.

**1. Haz todos los cambios primero.** El usuario quiere una sola pasada de pruebas al final, no una por cambio.

**2. Compila** en una llamada aparte (rápido; pilla casi todos los errores sin abrir el juego). La primera vez descarga
dependencias y puede tardar: pon `timeout_s` 1800.

```
gradlew compileJava
```

Si falla, arregla y repite. No pases al paso 3 hasta que compile.

**3. Prepara la escena.** Busca en el proyecto un guion de pruebas del cliente (por ejemplo
`src/main/java/<paquete>/client/dev/ClientDevShots.java`, o busca `dev.shots` / `dev.scene`) y sus propiedades
(`-P<modid>.dev.*`). Si el proyecto no tiene ninguno, créalo: una clase del cliente que, con la propiedad
`<modid>.dev.shots`, entra en el mundo indicado, ejecuta una lista de pasos por ticks, guarda capturas y cierra el juego.

Una escena es una lista de pasos `new Step(tick, List.of(comandos...), "nombre_captura" o null)`, con 20 ticks = 1 s:

```java
private static final List<Step> MI_PRUEBA_STEPS = List.of(
    new Step(40, List.of("gamemode creative @p", "time set 6000", "gamerule doDaylightCycle false", "weather clear",
        "tp @p 0 100 0"), null),                       // preparar el escenario
    new Step(80, List.of("give @p <modid>:algo"), null),   // la acción a probar
    new Step(110, List.of(), "mi_prueba_1"),            // captura (deja ~20-40 ticks de margen tras la acción)
    new Step(140, List.of(), null)                      // último paso: al acabar, el juego se cierra solo
);
```

- Los comandos normales (`tp`, `give`...) van al servidor integrado.
- Si el guion tiene ganchos de prueba propios (por ejemplo comandos que empiezan por `#` para abrir una pantalla, pulsar
  una tecla u ocultar el HUD), úsalos; mira los `command.startsWith("#...")` del archivo. Si te hace falta uno nuevo,
  añádelo ahí; para comprobar un valor, haz un gancho que lo escriba en el log con una marca fija, como `[shots] ...`.
- Registra la escena donde el guion elige la escena por nombre (`case "mi_prueba" -> MI_PRUEBA_STEPS;`). Si ya existe
  una escena que sirve, úsala.

**4. Abre Minecraft con la escena** (tarda 2-4 minutos; pon `timeout_s` 900):

```
gradlew runClient -P<modid>.dev.shots -P<modid>.dev.scene=mi_prueba "-P<modid>.dev.world=<mundo de pruebas>" > runs\prueba.log 2>&1
```

- `dev.world` entra **directamente** en ese mundo de `runs/client/saves/`, sin menús. Mira qué mundos hay ahí.
- El juego hace los pasos, guarda las capturas y **se cierra solo** al terminar la escena.
- Si en `runs/client/mods` están los mods de la instancia del usuario (Sodium, etc.), se prueba como lo verá él.
- Para cosas sin pantalla (generación del mundo, reglas), si el proyecto tiene comprobaciones automáticas al arrancar el
  servidor, usa `gradlew runServer` con su propiedad. Escribir en la consola del servidor (stdin) no funciona.

**5. Lee el resultado:**

- El log: busca las líneas de la marca del guion (y `ERROR`/`Exception`) en `runs\prueba.log`:

  ```
  findstr /C:"[shots]" /C:"ERROR" /C:"Exception" runs\prueba.log
  ```

  Al final debe salir la línea de fin del guion (por ejemplo `[shots] terminado`).
- Las fotos están en `runs/client/screenshots/<nombre>.png`. **Míralas** con `analizar_medio_gemini` (ruta relativa al
  proyecto, p. ej. `runs/client/screenshots/mi_prueba_1.png`) y una pregunta concreta: "¿Se ve un contador arriba en
  el centro debajo de las coordenadas? ¿Tapa algo?".

**6. Si algo no cuadra**, no cambies código a ciegas: añade un dato (un gancho que escriba el valor en el log), repite
solo esa escena y compara. Una captura sola puede engañar: si el juego iba recuperando ticks, puede ser un fotograma
viejo. El valor del log manda.

**7. Informa al usuario:** qué probaste, qué salió en el log, qué se ve en cada captura (con su nombre) y qué no se pudo
probar.

**Ver las capturas tú mismo:** si tu modelo ve imágenes, `read_file` con la ruta de la captura te la enseña directamente;
si no, usa `analizar_medio_gemini`.

<!-- incluida con faisp: v2 -->
