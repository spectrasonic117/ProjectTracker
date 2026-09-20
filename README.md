# ProjectTracker

Tablero de proyectos estilo Trello con diseño Apple (materiales translúcidos, tipografía
del sistema, modo claro/oscuro) construido con **Astro + React + Tailwind CSS v4 + dnd-kit**,
corriendo sobre **Bun**.

## Desarrollo

```bash
bun install
bun run dev        # http://localhost:4321
```

## Producción

```bash
bun run build
bun run preview
```

Otros comandos: `bun run check` (typecheck con `astro check`).

## Funcionalidades

- **Espacios de trabajo** por proyecto: crear, renombrar, eliminar (con confirmación) y cambiar entre ellos.
- **Color del proyecto**: haz clic en el punto de color de la cabecera del kanban para abrir el selector
  (paleta de 8 colores + personalizado). El color viaja en el JSON al exportar/importar y se valida al importar.
- **Columnas**: crear, renombrar, eliminar (sus tarjetas vuelven al Inbox) y **reordenar arrastrando** la cabecera.
- **Tarjetas**: crear desde cualquier columna o desde el Inbox, editar (clic en la tarjeta → modal, o botón de pantalla completa), eliminar con confirmación.
- **Drag & drop** (dnd-kit): tarjetas entre columnas, dentro de una columna, del tablero al **Inbox** y del Inbox a cualquier columna.
- **Inbox fijo** en la barra lateral izquierda (siempre visible, no se desplaza con el tablero).
- **Barra lateral contraíble**: el botón de la cabecera la reduce a un riel fino con los espacios como círculos
  de color y su inicial (clic para cambiar de espacio); el kanban gana el ancho completo. El estado contraído
  se recuerda entre sesiones. Importar/exportar/tema viven en el pie de la barra y solo se muestran expandida.
- **Modo claro/oscuro** con botón; respeta `prefers-color-scheme` y se guarda la preferencia.
- **Exportar/Importar datos en JSON**: descarga todo el estado (espacios, columnas, tarjetas e Inbox) como
  `project-tracker-AAAA-MM-DD.json` y restaura el estado desde un archivo, con confirmación previa y validación
  del formato (los ids huérfanos se descartan automáticamente). Ideal para mover los datos entre computadoras.
- Persistencia en **localStorage** (clave `project-tracker/state/v1`).

## Datos y futura base de datos

Todo el estado vive en un reducer normalizado (`src/lib/store.tsx`) y la persistencia está
aislada en **`src/lib/storage.ts`**: la app solo consume `loadState()` / `saveState()`.

Para conectar una base de datos más adelante basta con reemplazar esas dos funciones por
llamadas a tu API/endpoints — ni los componentes ni el store necesitan cambios.

## Estructura

```
src/
├── lib/
│   ├── types.ts        # AppState, Workspace, Column, Card
│   ├── storage.ts      # loadState/saveState (punto de intercambio para la DB)
│   ├── store.tsx       # reducer + contexto + selectors (useBoard)
│   ├── confirm.tsx     # diálogos de confirmación reutilizables (useConfirm)
│   ├── useTheme.ts     # tema claro/oscuro
│   └── useSidebar.ts   # estado contraído/expandido de la barra lateral
├── components/
│   ├── App.tsx         # DndContext, drag&drop entre contenedores, DragOverlay
│   ├── Sidebar.tsx     # barra fija: espacios de trabajo + Inbox droppable
│   ├── Board.tsx       # cabecera del espacio + columnas + «Añadir columna»
│   ├── Column.tsx      # columna sortable (cabecera arrastrable, renombrar, borrar)
│   ├── Card.tsx        # tarjeta sortable + compositor de nuevas tarjetas
│   └── CardEditor.tsx  # editor en modal y a pantalla completa
├── layouts/Layout.astro
├── pages/index.astro
└── styles/global.css   # Tailwind v4 + clases compartidas estilo Apple
```
