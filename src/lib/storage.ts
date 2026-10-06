import type { AppState, ColumnData, StorageConfig, StorageProvider, WorkspaceData } from './types';

/**
 * Persistencia de la app. El estado se guarda en localStorage (JSON) o, si el
 * usuario lo elige en Ajustes, en una base de datos PostgreSQL (Neon) a través
 * de los comandos nativos de Tauri. El resto de la aplicación solo consume este
 * módulo, por lo que cambiar de proveedor no afecta al store ni a los componentes.
 *
 * La configuración sensible (connection string de Neon) se cifra en localStorage
 * usando AES-GCM con una clave derivada del dispositivo.
 */

export type { StorageConfig, StorageProvider };

const STORAGE_KEY = 'project-tracker/state/v1';
const CONFIG_KEY = 'project-tracker/config/v1';
const CRYPTO_KEY_KEY = 'project-tracker/crypto/key/v1';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i;
const DEFAULT_COLOR = '#0a84ff';

/** true cuando el frontend corre dentro del shell nativo de Tauri (app de escritorio). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/* ------------------------------- crypto helpers ----------------------------- */

const DEFAULT_CONFIG: StorageConfig = { provider: 'local' };

/** Obtiene o crea la clave de cifrado simétrica para localStorage. */
async function getCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;

  try {
    let rawKey = localStorage.getItem(CRYPTO_KEY_KEY);
    let keyData: Uint8Array;

    if (rawKey) {
      // Clave existente: base64 → Uint8Array
      const binary = atob(rawKey);
      keyData = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) keyData[i] = binary.charCodeAt(i);
    } else {
      // Generar nueva clave aleatoria de 256 bits
      keyData = window.crypto.getRandomValues(new Uint8Array(32));
      // Guardar en base64
      let b64 = '';
      for (const byte of keyData) b64 += String.fromCharCode(byte);
      localStorage.setItem(CRYPTO_KEY_KEY, btoa(b64));
    }

    return window.crypto.subtle.importKey('raw', keyData.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

/** Cifra un objeto JSON y devuelve string base64 (iv + ciphertext + authTag). */
async function encryptConfig(config: StorageConfig): Promise<string | null> {
  const key = await getCryptoKey();
  if (!key) return null;

  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV para AES-GCM
  const data = new TextEncoder().encode(JSON.stringify(config));

  try {
    const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    // base64
    let b64 = '';
    for (const byte of combined) b64 += String.fromCharCode(byte);
    return btoa(b64);
  } catch {
    return null;
  }
}

/** Descifra string base64 y devuelve objeto StorageConfig. */
async function decryptConfig(encrypted: string): Promise<StorageConfig | null> {
  const key = await getCryptoKey();
  if (!key) return null;

  try {
    const combined = new Uint8Array(atob(encrypted).split('').map((c) => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const json = new TextDecoder().decode(plaintext);
    const parsed = JSON.parse(json) as Partial<StorageConfig>;
    const provider: StorageProvider = parsed.provider === 'neon' ? 'neon' : 'local';
    return { provider, neonConnectionString: parsed.neonConnectionString };
  } catch {
    return null;
  }
}

/* ------------------------------- configuración ------------------------------ */

export async function getStorageConfig(): Promise<StorageConfig> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;

    // Si no es base64 válido (migración desde versión sin cifrar), intenta parsear directo
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length < 20) {
      const parsed = JSON.parse(raw) as Partial<StorageConfig>;
      const provider: StorageProvider = parsed.provider === 'neon' ? 'neon' : 'local';
      // Re-cifrar para futuras lecturas
      await setStorageConfig({ provider, neonConnectionString: parsed.neonConnectionString });
      return { provider, neonConnectionString: parsed.neonConnectionString };
    }

    const decrypted = await decryptConfig(raw);
    return decrypted ?? DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setStorageConfig(config: StorageConfig): Promise<void> {
  try {
    const encrypted = await encryptConfig(config);
    if (encrypted) {
      localStorage.setItem(CONFIG_KEY, encrypted);
    } else {
      // Fallback sin cifrar si falla crypto
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }
  } catch {
    // Cuota llena o almacenamiento deshabilitado: la configuración solo dura la sesión.
  }
}

/* ------------------------------- localStorage ------------------------------- */

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

/* ------------------------------- Neon (Tauri) ------------------------------- */

/** Comprueba que la cadena de conexión a Neon es válida. Solo en escritorio. */
export async function testNeonConnection(connectionString: string): Promise<void> {
  if (!isTauri()) throw new Error('La base de datos externa solo está disponible en la app de escritorio.');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('test_neon_connection', { config: { connectionString } });
}

/** Carga el estado desde Neon. Devuelve null si aún no hay datos guardados. */
export async function loadStateFromDb(connectionString: string): Promise<AppState | null> {
  if (!isTauri()) throw new Error('La base de datos externa solo está disponible en la app de escritorio.');
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<string | null>('load_state_from_db', { config: { connectionString } });
  return raw ? parseState(raw) : null;
}

/** Guarda el estado en Neon (upsert del único registro de estado). */
export async function saveStateToDb(connectionString: string, state: AppState): Promise<void> {
  if (!isTauri()) throw new Error('La base de datos externa solo está disponible en la app de escritorio.');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_state_to_db', { config: { connectionString }, data: JSON.stringify(state) });
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
