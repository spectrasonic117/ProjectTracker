import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { INBOX_ID, type AppState, type CardData, type ColumnData, type WorkspaceData } from './types';
import { loadState, saveState } from './storage';

export const WORKSPACE_COLORS = [
  '#0a84ff',
  '#bf5af2',
  '#ff375f',
  '#ff9f0a',
  '#30d158',
  '#5e5ce6',
  '#64d2ff',
  '#ff6482',
] as const;

function uid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ---------------------------------- seed ---------------------------------- */

function createSeed(): AppState {
  let seq = Date.now();
  const cards: Record<string, CardData> = {};
  const columns: Record<string, ColumnData> = {};

  const card = (title: string, description = ''): string => {
    const id = uid();
    cards[id] = { id, title, description, createdAt: seq++ };
    return id;
  };
  const column = (title: string, cardIds: string[]): string => {
    const id = uid();
    columns[id] = { id, title, cardIds };
    return id;
  };

  const todo = column('Por hacer', [
    card(
      'Bienvenido a ProjectTracker',
      'Haz clic en una tarjeta para editarla, o usa el botón de pantalla completa. Arrastra tarjetas entre columnas y hacia o desde el Inbox de la izquierda.',
    ),
    card('Crear tu primer proyecto', 'Añade espacios de trabajo desde la barra lateral.'),
  ]);
  const doing = column('En progreso', []);
  const done = column('Hecho', [card('Configurar el tablero')]);

  const workspaceId = uid();
  const workspaces: Record<string, WorkspaceData> = {
    [workspaceId]: {
      id: workspaceId,
      name: 'Mi proyecto',
      color: WORKSPACE_COLORS[0],
      columnIds: [todo, doing, done],
      inboxCardIds: [card('Idea suelta', 'Las tarjetas del Inbox se arrastran a cualquier columna cuando las necesites.')],
    },
  };

  return {
    workspaceIds: [workspaceId],
    activeWorkspaceId: workspaceId,
    workspaces,
    columns,
    cards,
  };
}

/* --------------------------------- actions -------------------------------- */

type Action =
  | { type: 'workspace/add'; name: string; color: string }
  | { type: 'workspace/delete'; workspaceId: string }
  | { type: 'workspace/rename'; workspaceId: string; name: string }
  | { type: 'workspace/setColor'; workspaceId: string; color: string }
  | { type: 'workspace/activate'; workspaceId: string }
  | { type: 'column/add'; workspaceId: string; title: string }
  | { type: 'column/delete'; workspaceId: string; columnId: string }
  | { type: 'column/rename'; columnId: string; title: string }
  | { type: 'column/move'; workspaceId: string; from: number; to: number }
  | { type: 'card/add'; workspaceId: string; containerId: string; title: string }
  | { type: 'card/delete'; cardId: string }
  | { type: 'card/update'; cardId: string; patch: Partial<Pick<CardData, 'title' | 'description'>> }
  | { type: 'card/move'; workspaceId: string; cardId: string; toContainerId: string; index: number | null }
  | { type: 'state/import'; state: AppState };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'workspace/add': {
      const id = uid();
      const workspace: WorkspaceData = {
        id,
        name: action.name,
        color: action.color,
        columnIds: [],
        inboxCardIds: [],
      };
      return {
        ...state,
        workspaceIds: [...state.workspaceIds, id],
        activeWorkspaceId: id,
        workspaces: { ...state.workspaces, [id]: workspace },
      };
    }

    case 'workspace/delete': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace) return state;
      const cards = { ...state.cards };
      for (const columnId of workspace.columnIds) {
        for (const cardId of state.columns[columnId]?.cardIds ?? []) delete cards[cardId];
      }
      for (const cardId of workspace.inboxCardIds) delete cards[cardId];
      const columns = { ...state.columns };
      for (const columnId of workspace.columnIds) delete columns[columnId];
      const workspaces = { ...state.workspaces };
      delete workspaces[action.workspaceId];
      const workspaceIds = state.workspaceIds.filter((id) => id !== action.workspaceId);
      const activeWorkspaceId =
        state.activeWorkspaceId === action.workspaceId ? (workspaceIds[0] ?? null) : state.activeWorkspaceId;
      return { ...state, workspaceIds, activeWorkspaceId, workspaces, columns, cards };
    }

    case 'workspace/rename': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace || !action.name.trim()) return state;
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [action.workspaceId]: { ...workspace, name: action.name.trim() },
        },
      };
    }

    case 'workspace/setColor': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace) return state;
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [action.workspaceId]: { ...workspace, color: action.color },
        },
      };
    }

    case 'workspace/activate': {
      if (!state.workspaces[action.workspaceId]) return state;
      return { ...state, activeWorkspaceId: action.workspaceId };
    }

    case 'column/add': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace || !action.title.trim()) return state;
      const id = uid();
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [action.workspaceId]: { ...workspace, columnIds: [...workspace.columnIds, id] },
        },
        columns: { ...state.columns, [id]: { id, title: action.title.trim(), cardIds: [] } },
      };
    }

    case 'column/delete': {
      const workspace = state.workspaces[action.workspaceId];
      const column = state.columns[action.columnId];
      if (!workspace || !column) return state;
      // Las tarjetas de la columna vuelven al Inbox en lugar de perderse.
      const columns = { ...state.columns };
      delete columns[action.columnId];
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [action.workspaceId]: {
            ...workspace,
            columnIds: workspace.columnIds.filter((id) => id !== action.columnId),
            inboxCardIds: [...workspace.inboxCardIds, ...column.cardIds],
          },
        },
        columns,
      };
    }

    case 'column/rename': {
      const column = state.columns[action.columnId];
      if (!column || !action.title.trim()) return state;
      return { ...state, columns: { ...state.columns, [action.columnId]: { ...column, title: action.title.trim() } } };
    }

    case 'column/move': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace) return state;
      const { from, to } = action;
      if (from < 0 || from >= workspace.columnIds.length || to < 0 || to >= workspace.columnIds.length) return state;
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [action.workspaceId]: { ...workspace, columnIds: arrayMove(workspace.columnIds, from, to) },
        },
      };
    }

    case 'card/add': {
      const workspace = state.workspaces[action.workspaceId];
      if (!workspace || !action.title.trim()) return state;
      const id = uid();
      const card: CardData = { id, title: action.title.trim(), description: '', createdAt: Date.now() };
      if (action.containerId === INBOX_ID) {
        return {
          ...state,
          cards: { ...state.cards, [id]: card },
          workspaces: {
            ...state.workspaces,
            [action.workspaceId]: { ...workspace, inboxCardIds: [...workspace.inboxCardIds, id] },
          },
        };
      }
      const column = state.columns[action.containerId];
      if (!column) return state;
      return {
        ...state,
        cards: { ...state.cards, [id]: card },
        columns: { ...state.columns, [action.containerId]: { ...column, cardIds: [...column.cardIds, id] } },
      };
    }

    case 'card/delete': {
      let workspaces = state.workspaces;
      let columns = state.columns;
      const inInbox = Object.values(state.workspaces).find((ws) => ws.inboxCardIds.includes(action.cardId));
      if (inInbox) {
        workspaces = {
          ...workspaces,
          [inInbox.id]: { ...inInbox, inboxCardIds: inInbox.inboxCardIds.filter((id) => id !== action.cardId) },
        };
      } else {
        const inColumn = Object.values(state.columns).find((col) => col.cardIds.includes(action.cardId));
        if (inColumn) {
          columns = {
            ...columns,
            [inColumn.id]: { ...inColumn, cardIds: inColumn.cardIds.filter((id) => id !== action.cardId) },
          };
        }
      }
      if (workspaces === state.workspaces && columns === state.columns && !state.cards[action.cardId]) return state;
      const cards = { ...state.cards };
      delete cards[action.cardId];
      return { ...state, workspaces, columns, cards };
    }

    case 'card/update': {
      const card = state.cards[action.cardId];
      if (!card) return state;
      return { ...state, cards: { ...state.cards, [action.cardId]: { ...card, ...action.patch } } };
    }

    case 'card/move': {
      return applyCardMove(state, action);
    }

    case 'state/import': {
      // El estado ya llega validado y saneado desde storage.parseState.
      return action.state;
    }
  }
}

function applyCardMove(
  state: AppState,
  action: Extract<Action, { type: 'card/move' }>,
): AppState {
  const workspaceId = action.workspaceId;
  const workspace = state.workspaces[workspaceId];
  if (!workspace || !state.cards[action.cardId]) return state;

  const cardId = action.cardId;
  const inInbox = workspace.inboxCardIds.includes(cardId);
  const sourceColumnId = inInbox
    ? null
    : (workspace.columnIds.find((id) => state.columns[id]?.cardIds.includes(cardId)) ?? null);
  if (!inInbox && !sourceColumnId) return state;

  // 1. Quitar del contenedor de origen.
  let inboxCardIds = workspace.inboxCardIds;
  let columns = state.columns;
  if (inInbox) {
    inboxCardIds = inboxCardIds.filter((id) => id !== cardId);
  } else {
    const source = columns[sourceColumnId!];
    columns = { ...columns, [sourceColumnId!]: { ...source, cardIds: source.cardIds.filter((id) => id !== cardId) } };
  }

  // 2. Insertar en el contenedor de destino (índice calculado sobre la lista original,
  //    de modo que el resultado coincida con un arrayMove cuando es el mismo contenedor).
  const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));
  if (action.toContainerId === INBOX_ID) {
    const index = action.index == null ? inboxCardIds.length : clamp(action.index, inboxCardIds.length);
    inboxCardIds = [...inboxCardIds.slice(0, index), cardId, ...inboxCardIds.slice(index)];
  } else {
    const target = columns[action.toContainerId];
    if (!target) return state;
    const index = action.index == null ? target.cardIds.length : clamp(action.index, target.cardIds.length);
    columns = { ...columns, [action.toContainerId]: { ...target, cardIds: [...target.cardIds.slice(0, index), cardId, ...target.cardIds.slice(index)] } };
  }

  return {
    ...state,
    columns,
    workspaces: { ...state.workspaces, [workspaceId]: { ...workspace, inboxCardIds } },
  };
}

/* -------------------------------- selectors ------------------------------- */

/** Devuelve el contenedor (id de columna o INBOX_ID) al que pertenece un id de tarjeta. */
export function findCardContainer(state: AppState, workspaceId: string, cardId: string): string | null {
  const workspace = state.workspaces[workspaceId];
  if (!workspace) return null;
  if (workspace.inboxCardIds.includes(cardId)) return INBOX_ID;
  for (const columnId of workspace.columnIds) {
    if (state.columns[columnId]?.cardIds.includes(cardId)) return columnId;
  }
  return null;
}

/** Resuelve cualquier id (inbox, columna o tarjeta) al contenedor que lo contiene. */
export function resolveContainer(state: AppState, workspaceId: string, id: string): string | null {
  if (id === INBOX_ID) return INBOX_ID;
  const workspace = state.workspaces[workspaceId];
  if (!workspace) return null;
  if (workspace.columnIds.includes(id)) return id;
  return findCardContainer(state, workspaceId, id);
}

export function getContainerCardIds(state: AppState, workspaceId: string, containerId: string): string[] {
  const workspace = state.workspaces[workspaceId];
  if (!workspace) return [];
  if (containerId === INBOX_ID) return workspace.inboxCardIds;
  return state.columns[containerId]?.cardIds ?? [];
}

export function countWorkspaceCards(state: AppState, workspaceId: string): number {
  const workspace = state.workspaces[workspaceId];
  if (!workspace) return 0;
  const inColumns = workspace.columnIds.reduce((sum, id) => sum + (state.columns[id]?.cardIds.length ?? 0), 0);
  return inColumns + workspace.inboxCardIds.length;
}

/* --------------------------------- context -------------------------------- */

export interface BoardActions {
  addWorkspace(name: string): void;
  deleteWorkspace(workspaceId: string): void;
  renameWorkspace(workspaceId: string, name: string): void;
  setWorkspaceColor(workspaceId: string, color: string): void;
  setActiveWorkspace(workspaceId: string): void;
  addColumn(workspaceId: string, title: string): void;
  deleteColumn(workspaceId: string, columnId: string): void;
  renameColumn(columnId: string, title: string): void;
  moveColumn(workspaceId: string, from: number, to: number): void;
  addCard(containerId: string, title: string): void;
  deleteCard(cardId: string): void;
  updateCard(cardId: string, patch: Partial<Pick<CardData, 'title' | 'description'>>): void;
  moveCard(cardId: string, toContainerId: string, index: number | null): void;
  importState(state: AppState): void;
}

interface BoardApi {
  state: AppState;
  actions: BoardActions;
}

const BoardContext = createContext<BoardApi | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? createSeed());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const api = useMemo<BoardApi>(() => {
    const activeId = state.activeWorkspaceId ?? '';
    return {
      state,
      actions: {
        addWorkspace: (name) => {
          const color = WORKSPACE_COLORS[state.workspaceIds.length % WORKSPACE_COLORS.length];
          dispatch({ type: 'workspace/add', name, color });
        },
        deleteWorkspace: (workspaceId) => dispatch({ type: 'workspace/delete', workspaceId }),
        renameWorkspace: (workspaceId, name) => dispatch({ type: 'workspace/rename', workspaceId, name }),
        setWorkspaceColor: (workspaceId, color) => dispatch({ type: 'workspace/setColor', workspaceId, color }),
        setActiveWorkspace: (workspaceId) => dispatch({ type: 'workspace/activate', workspaceId }),
        addColumn: (workspaceId, title) => dispatch({ type: 'column/add', workspaceId, title }),
        deleteColumn: (workspaceId, columnId) => dispatch({ type: 'column/delete', workspaceId, columnId }),
        renameColumn: (columnId, title) => dispatch({ type: 'column/rename', columnId, title }),
        moveColumn: (workspaceId, from, to) => dispatch({ type: 'column/move', workspaceId, from, to }),
        addCard: (containerId, title) => dispatch({ type: 'card/add', workspaceId: activeId, containerId, title }),
        deleteCard: (cardId) => dispatch({ type: 'card/delete', cardId }),
        updateCard: (cardId, patch) => dispatch({ type: 'card/update', cardId, patch }),
        moveCard: (cardId, toContainerId, index) =>
          dispatch({ type: 'card/move', workspaceId: activeId, cardId, toContainerId, index }),
        importState: (next) => dispatch({ type: 'state/import', state: next }),
      },
    };
  }, [state]);

  return <BoardContext.Provider value={api}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardApi {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoard debe usarse dentro de <BoardProvider>');
  return context;
}
