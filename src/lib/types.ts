export interface CardData {
  id: string;
  title: string;
  description: string;
  createdAt: number;
}

export interface ColumnData {
  id: string;
  title: string;
  cardIds: string[];
}

export interface WorkspaceData {
  id: string;
  name: string;
  color: string;
  columnIds: string[];
  /** Tarjetas sin columna del espacio de trabajo. */
  inboxCardIds: string[];
}

export interface AppState {
  workspaceIds: string[];
  activeWorkspaceId: string | null;
  workspaces: Record<string, WorkspaceData>;
  columns: Record<string, ColumnData>;
  cards: Record<string, CardData>;
}

/** Identificador reservado para el contenedor Inbox (las columnas usan su propio id). */
export const INBOX_ID = 'inbox';

/** Proveedor de almacenamiento disponible. */
export type StorageProvider = 'local' | 'neon';

/** Configuración de almacenamiento persistente. */
export interface StorageConfig {
  provider: StorageProvider;
  /** Cadena de conexión para Neon (solo cuando provider === 'neon'). */
  neonConnectionString?: string;
}
