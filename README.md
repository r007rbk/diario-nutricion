# Diario de Nutrición Deportiva

App web para el móvil que registra comidas, bebida, suplementos y actividad en una hoja de Google Sheets, sin tener que abrir la hoja.

```
Móvil (app web instalada)  ──►  Google Apps Script  ──►  celda del día en el Sheet
     cola sin conexión            busca fila y columna      solo escribe el texto
```

## Qué hace

- **Registro rápido** por franja (desayuno, media mañana, comida, merienda, cena, alrededor del deporte y actividad), con la hora puesta sola.
- **Sugerencias** a partir de lo que has registrado otros días.
- **Bebida, suplementos y lugar** en apartados separados.
- **Plato Harvard:** indica si la comida lo cumple y qué falta (solo informativo).
- **Menú ideal:** compara lo registrado con el esquema de la hoja, por día y por semana.
- **¿Qué como?:** propone comidas para cumplir el menú ideal.
- **Progreso:** líneas de color por comida y día (bien, regular, mal) por semana, mes o año.
- **Ajustes:** botones de comida y bebida, y diccionario de alimentos editables.
- **Sin conexión:** los registros esperan en el móvil y se envían al recuperar la red.

## Estructura

| Ruta | Qué es |
|---|---|
| raíz (`index.html`, `app.js`, `plan.js`, `styles.css`, `sw.js`, `icons/`) | La app: web estática, sin compilar. GitHub Pages la publica desde `main`. |
| `apps-script/` | El script que se pega en el Sheet (`Code.gs` + `appsscript.json`). |
| `tests/` | Pruebas que se abren en el navegador, con un backend simulado. |

## Instalación

1. **Script:**
   - En el Sheet, ve a **Extensiones → Apps Script** y pega `apps-script/Code.gs` y `appsscript.json`.
   - Añade la propiedad de script `API_TOKEN` con una cadena larga aleatoria.
2. **Publicar el script:** **Implementar → Nueva implementación → Aplicación web**, con **Ejecutar como: Yo** y acceso **Cualquier usuario**. Copia la URL `/exec`.
3. **Instalar en el móvil:**
   - Abre la app publicada en Safari y pulsa **Compartir → Añadir a pantalla de inicio**.
   - En Ajustes, pega la URL y el token.

La app no contiene datos ni claves: la URL y el token se guardan solo en el móvil.

## Actualizar

- **App:** push a `main`.
- **Script:** pega el nuevo `Code.gs` y publica con **Implementar → Gestionar implementaciones → Nueva versión**.
