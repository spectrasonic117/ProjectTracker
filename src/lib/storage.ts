import type { AppState, ColumnData, WorkspaceData } from './types';

/**
 * Persistencia de la app. Hoy es localStorage; cuando se conecte una base de
 * datos solo hay que reemplazar `loadState`/`saveState` por llamadas a la API:
 * el resto de la aplicación únicamente consume este módulo.
 */

const STORAGE_KEY = 'project-tracker/state/v1';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i;
const DEFAULT_COLOR = '#0a84ff';

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseState(raw);
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Cuota llena o almacenamiento deshabilitado: la app sigue funcionando en memoria.
  }
}

/**
 * Interpreta un JSON serializado de la app (p. ej. de un archivo exportado).
 * Devuelve null si el formato no es válido; si lo es, sanea las referencias
 * (ids huérfanos de columnas o tarjetas) para que el estado sea seguro de usar.
 */
export function parseState(raw: string): AppState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isValidState(parsed) ? sanitizeState(parsed) : null;
}

function isValidState(value: unknown): value is AppState {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    Array.isArray(s.workspaceIds) &&
    typeof s.workspaces === 'object' &&
    s.workspaces !== null &&
    typeof s.columns === 'object' &&
    s.columns !== null &&
    typeof s.cards === 'object' &&
    s.cards !== null
  );
}

/** Descarta referencias rotas para que un JSON editado a mano no rompa la app. */
function sanitizeState(state: AppState): AppState {
  const { cards } = state;
  const workspaces: Record<string, WorkspaceData> = {};
  const columns: Record<string, ColumnData> = {};

  const workspaceIds = [...new Set(state.workspaceIds)].filter((id) => {
    const ws = state.workspaces[id];
    return Boolean(ws && typeof ws.name === 'string');
  });

  for (const id of workspaceIds) {
    const ws = state.workspaces[id];
    const columnIds = [...new Set(ws.columnIds ?? [])].filter((cid) => state.columns[cid]);
    const inboxCardIds = [...new Set(ws.inboxCardIds ?? [])].filter((cardId) => cards[cardId]);
    workspaces[id] = {
      ...ws,
      color: typeof ws.color === 'string' && HEX_COLOR.test(ws.color) ? ws.color : DEFAULT_COLOR,
      columnIds,
      inboxCardIds,
    };
    for (const cid of columnIds) {
      const column = state.columns[cid];
      columns[cid] = { ...column, cardIds: [...new Set(column.cardIds ?? [])].filter((cardId) => cards[cardId]) };
    }
  }

  const activeWorkspaceId =
    state.activeWorkspaceId && workspaceIds.includes(state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : (workspaceIds[0] ?? null);

  return { workspaceIds, activeWorkspaceId, workspaces, columns, cards };
}
