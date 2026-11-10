use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use std::collections::HashMap;

/// Configuración para conectarse a la base de datos externa (Neon).
/// El frontend envía la cadena de conexión desde el diálogo de Ajustes.
#[derive(Serialize, Deserialize, Clone)]
pub struct DbConfig {
    #[serde(rename = "connectionString")]
    pub connection_string: String,
}

const SCHEMA_VERSION: &str = "2";

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workspaces (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    color    TEXT NOT NULL,
    position INT  NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    position     INT  NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  BIGINT NOT NULL
);

-- Orden de las tarjetas dentro del Inbox de cada espacio de trabajo.
CREATE TABLE IF NOT EXISTS inbox_cards (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    position     INT  NOT NULL,
    card_id      TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    PRIMARY KEY (workspace_id, position)
);

-- Orden de las tarjetas dentro de cada columna.
CREATE TABLE IF NOT EXISTS column_cards (
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    position  INT  NOT NULL,
    card_id   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    PRIMARY KEY (column_id, position)
);

-- Ajustes globales (una única fila, id = 1). La FK anula la referencia
-- automáticamente si su espacio de trabajo desaparece.
CREATE TABLE IF NOT EXISTS prefs (
    id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Control de versiones del esquema para migraciones futuras.
CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

/// Crea un pool de conexiones corto para la operación puntual.
async fn connect(config: &DbConfig) -> Result<sqlx::PgPool, String> {
    PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(12))
        .connect(&config.connection_string)
        .await
        .map_err(|error| format!("No se pudo conectar a la base de datos: {error}"))
}

#[tauri::command]
pub async fn ping_neon(config: DbConfig) -> Result<(), String> {
    let pool = connect(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|error| format!("Error al hacer ping a la base de datos: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn test_neon_connection(config: DbConfig) -> Result<(), String> {
    ping_neon(config).await
}

/// Garantiza que el esquema v2 existe y migra el estado v1 (blob JSONB) si
/// la base tiene el formato antiguo. El DDL es idempotente, así que ejecutarlo
/// cada vez es barato y cubre tanto las DB nuevas como las ya v2.
async fn ensure_schema(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::raw_sql(SCHEMA_SQL)
        .execute(pool)
        .await
        .map_err(|error| format!("No se pudo preparar el esquema: {error}"))?;

    // Solo una base v1 puede tener el blob sin metadatos de versión.
    let version: Option<String> =
        sqlx::query_scalar("SELECT value FROM metadata WHERE key = 'schema'")
            .fetch_optional(pool)
            .await
            .map_err(|error| format!("No se pudo leer la versión del esquema: {error}"))?;
    if version.is_none() && table_exists(pool, "app_state").await? {
        migrate_v1_blob(pool).await?;
    }

    sqlx::query(
        "INSERT INTO metadata (key, value) VALUES ('schema', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(SCHEMA_VERSION)
    .execute(pool)
    .await
    .map_err(|error| format!("No se pudo registrar la versión del esquema: {error}"))?;
    Ok(())
}

/// Comprueba si una tabla existe en el esquema público.
async fn table_exists(pool: &sqlx::PgPool, table: &str) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
    )
    .bind(table)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("No se pudo inspeccionar el esquema: {error}"))?;
    Ok(count > 0)
}

/* ------------------------------ payloads v2 ------------------------------ */

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPayload {
    id: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    created_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePayload {
    id: String,
    name: String,
    #[serde(default = "default_color")]
    color: String,
    #[serde(default)]
    inbox_card_ids: Vec<String>,
    #[serde(default)]
    column_ids: Vec<String>,
}

fn default_color() -> String {
    "#0a84ff".to_string()
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnPayload {
    id: String,
    workspace_id: String,
    title: String,
    #[serde(default)]
    card_ids: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPayload {
    #[serde(default)]
    active_workspace_id: Option<String>,
}

/// Escribe el estado completo en las tablas v2 dentro de una única transacción.
/// El orden de borrado/inserción respeta las FK: primero tarjetas, luego
/// espacios (incluye inbox), luego columnas (incluye su orden interno).
async fn write_state_rows(
    pool: &sqlx::PgPool,
    cards: &[CardPayload],
    workspaces: &[WorkspacePayload],
    columns: &[ColumnPayload],
    active_workspace_id: Option<String>,
) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("No se pudo iniciar la transacción: {error}"))?;

    sqlx::query("DELETE FROM cards")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("No se pudo limpiar la tabla cards: {error}"))?;
    for card in cards {
        sqlx::query("INSERT INTO cards (id, title, description, created_at) VALUES ($1, $2, $3, $4)")
            .bind(&card.id)
            .bind(&card.title)
            .bind(&card.description)
            .bind(card.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("No se pudo guardar la tarjeta {}: {error}", card.id))?;
    }

    sqlx::query("DELETE FROM workspaces")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("No se pudo limpiar la tabla workspaces: {error}"))?;
    for (position, workspace) in workspaces.iter().enumerate() {
        sqlx::query("INSERT INTO workspaces (id, name, color, position) VALUES ($1, $2, $3, $4)")
            .bind(&workspace.id)
            .bind(&workspace.name)
            .bind(&workspace.color)
            .bind(position as i32)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("No se pudo guardar el espacio {}: {error}", workspace.id))?;
        for (index, card_id) in workspace.inbox_card_ids.iter().enumerate() {
            sqlx::query(
                "INSERT INTO inbox_cards (workspace_id, card_id, position) VALUES ($1, $2, $3)",
            )
            .bind(&workspace.id)
            .bind(card_id)
            .bind(index as i32)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("No se pudo guardar el inbox de {}: {error}", workspace.id))?;
        }
    }

    sqlx::query("DELETE FROM columns")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("No se pudo limpiar la tabla columns: {error}"))?;
    for (position, column) in columns.iter().enumerate() {
        sqlx::query(
            "INSERT INTO columns (id, workspace_id, title, position) VALUES ($1, $2, $3, $4)",
        )
        .bind(&column.id)
        .bind(&column.workspace_id)
        .bind(&column.title)
        .bind(position as i32)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("No se pudo guardar la columna {}: {error}", column.id))?;
        for (index, card_id) in column.card_ids.iter().enumerate() {
            sqlx::query("INSERT INTO column_cards (column_id, card_id, position) VALUES ($1, $2, $3)")
                .bind(&column.id)
                .bind(card_id)
                .bind(index as i32)
                .execute(&mut *tx)
                .await
                .map_err(|error| format!(
                    "No se pudo guardar la posición {index} de {} en {}: {error}",
                    card_id, column.id
                ))?;
        }
    }

    sqlx::query(
        "INSERT INTO prefs (id, active_workspace_id, updated_at) VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET active_workspace_id = EXCLUDED.active_workspace_id, updated_at = NOW()",
    )
    .bind(active_workspace_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("No se pudo guardar las preferencias: {error}"))?;

    tx.commit()
        .await
        .map_err(|error| format!("No se pudo confirmar la transacción: {error}"))?;
    Ok(())
}

/// Guarda el estado completo en las tablas relacionales de forma atómica.
/// shortcut: cada cambio reescribe filas completas; con tableros muy grandes
/// conviene pasar a upserts por acción.
#[tauri::command]
pub async fn save_state_to_db(
    config: DbConfig,
    cards: Vec<CardPayload>,
    workspaces: Vec<WorkspacePayload>,
    columns: Vec<ColumnPayload>,
    prefs: PrefsPayload,
) -> Result<(), String> {
    let pool = connect(&config).await?;
    ensure_schema(&pool).await?;
    write_state_rows(
        &pool,
        &cards,
        &workspaces,
        &columns,
        prefs.active_workspace_id,
    )
    .await?;
    Ok(())
}

/// Carga el estado guardado y lo ensambla al mismo JSON de `AppState` que la
/// app serializa, para que el frontend reutilice su sanitización. Devuelve
/// `None` si la DB nunca fue inicializada.
#[tauri::command]
pub async fn load_state_from_db(config: DbConfig) -> Result<Option<String>, String> {
    let pool = connect(&config).await?;
    ensure_schema(&pool).await?;

    let workspace_rows: Vec<(String, String, String, i32)> = sqlx::query_as(
        "SELECT id, name, color, position FROM workspaces ORDER BY position, id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("No se pudo leer los espacios de trabajo: {error}"))?;

    let prefs_row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT active_workspace_id FROM prefs WHERE id = 1")
            .fetch_optional(&pool)
            .await
            .map_err(|error| format!("No se pudo leer las preferencias: {error}"))?;

    // DB recién creada y sin datos: no hay nada guardado, que el frontend use
    // su almacenamiento local en lugar de sobrescribirlo con un estado vacío.
    if workspace_rows.is_empty() && prefs_row.is_none() {
        return Ok(None);
    }

    let mut inbox_by_workspace: HashMap<String, Vec<String>> = HashMap::new();
    let inbox_rows: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT inbox_cards.workspace_id, inbox_cards.card_id, inbox_cards.position
         FROM inbox_cards JOIN workspaces ON workspaces.id = inbox_cards.workspace_id
         ORDER BY workspaces.position, inbox_cards.position",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("No se pudo leer las tarjetas del inbox: {error}"))?;
    for (workspace_id, card_id, _) in inbox_rows {
        inbox_by_workspace
            .entry(workspace_id)
            .or_default()
            .push(card_id);
    }

    let column_rows: Vec<(String, String, String, i32)> = sqlx::query_as(
        "SELECT id, workspace_id, title, position FROM columns ORDER BY workspace_id, position",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("No se pudo leer las columnas: {error}"))?;

    let mut membership_by_column: HashMap<String, Vec<String>> = HashMap::new();
    let membership_rows: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT column_cards.column_id, column_cards.card_id, column_cards.position
         FROM column_cards JOIN columns ON columns.id = column_cards.column_id
         ORDER BY columns.position, column_cards.position",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("No se pudo leer el orden de las tarjetas: {error}"))?;
    for (column_id, card_id, _) in membership_rows {
        membership_by_column
            .entry(column_id)
            .or_default()
            .push(card_id);
    }

    let mut columns_by_workspace: HashMap<String, Vec<String>> = HashMap::new();
    let mut columns_map = serde_json::Map::new();
    for (id, workspace_id, title, _) in column_rows {
        columns_by_workspace
            .entry(workspace_id.clone())
            .or_default()
            .push(id.clone());
        let card_ids = membership_by_column.remove(&id).unwrap_or_default();
        columns_map.insert(
            id.clone(),
            serde_json::json!({
                "id": id,
                "title": title,
                "cardIds": card_ids,
            }),
        );
    }

    let cards_rows: Vec<(String, String, Option<String>, Option<i64>)> = sqlx::query_as(
        "SELECT id, title, description, created_at FROM cards",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("No se pudo leer las tarjetas: {error}"))?;
    let mut cards_map = serde_json::Map::new();
    for (id, title, description, created_at) in cards_rows {
        cards_map.insert(
            id.clone(),
            serde_json::json!({
                "id": id,
                "title": title,
                "description": description.unwrap_or_default(),
                "createdAt": created_at.unwrap_or_default(),
            }),
        );
    }

    let mut workspaces_map = serde_json::Map::new();
    let mut workspace_ids = Vec::with_capacity(workspace_rows.len());
    for (id, name, color, _) in workspace_rows {
        workspace_ids.push(id.clone());
        let column_ids = columns_by_workspace.remove(&id).unwrap_or_default();
        let inbox_card_ids = inbox_by_workspace.remove(&id).unwrap_or_default();
        workspaces_map.insert(
            id.clone(),
            serde_json::json!({
                "id": id,
                "name": name,
                "color": color,
                "columnIds": column_ids,
                "inboxCardIds": inbox_card_ids,
            }),
        );
    }

    let active_workspace_id = prefs_row
        .and_then(|(active,)| active)
        .filter(|id| workspace_ids.contains(id));
    let state = serde_json::json!({
        "workspaceIds": workspace_ids,
        "activeWorkspaceId": active_workspace_id,
        "workspaces": serde_json::Value::Object(workspaces_map),
        "columns": serde_json::Value::Object(columns_map),
        "cards": serde_json::Value::Object(cards_map),
    });

    let json = serde_json::to_string(&state)
        .map_err(|error| format!("No se pudo serializar el estado: {error}"))?;
    Ok(Some(json))
}

/* --------------------------- migración desde v1 --------------------------- */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspace {
    name: String,
    #[serde(default = "default_color")]
    color: String,
    #[serde(default)]
    column_ids: Vec<String>,
    #[serde(default)]
    inbox_card_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyColumn {
    #[serde(default)]
    title: String,
    #[serde(default)]
    card_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyState {
    workspace_ids: Vec<String>,
    active_workspace_id: Option<String>,
    workspaces: HashMap<String, LegacyWorkspace>,
    #[serde(default)]
    columns: HashMap<String, LegacyColumn>,
    #[serde(default)]
    cards: HashMap<String, CardPayload>,
}

/// Lee el blob JSONB de la v1, lo desnormaliza en las tablas v2 y archiva la
/// tabla antigua (`app_state_v1_backup`) en lugar de borrarla.
async fn migrate_v1_blob(pool: &sqlx::PgPool) -> Result<(), String> {
    let row: Option<(serde_json::Value,)> = sqlx::query_as("SELECT data FROM app_state WHERE id = 1")
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("No se pudo leer el estado antiguo: {error}"))?;
    let Some((blob,)) = row else {
        return Ok(());
    };

    let legacy: LegacyState = serde_json::from_value(blob)
        .map_err(|error| format!("El estado antiguo no tiene un formato válido: {error}"))?;

    let cards: Vec<CardPayload> = legacy.cards.into_values().collect();
    let mut columns_seen = std::collections::HashSet::new();
    let mut columns = Vec::new();
    let mut workspaces = Vec::with_capacity(legacy.workspace_ids.len());
    for id in &legacy.workspace_ids {
        let Some(workspace) = legacy.workspaces.get(id) else { continue };
        workspaces.push(WorkspacePayload {
            id: id.clone(),
            name: workspace.name.clone(),
            color: workspace.color.clone(),
            inbox_card_ids: workspace.inbox_card_ids.clone(),
            column_ids: workspace.column_ids.clone(),
        });
        for column_id in &workspace.column_ids {
            if !columns_seen.insert(column_id.clone()) {
                continue;
            }
            let Some(column) = legacy.columns.get(column_id) else { continue };
            columns.push(ColumnPayload {
                id: column_id.clone(),
                workspace_id: id.clone(),
                title: column.title.clone(),
                card_ids: column.card_ids.clone(),
            });
        }
    }

    write_state_rows(pool, &cards, &workspaces, &columns, legacy.active_workspace_id)
        .await?;
    sqlx::query("ALTER TABLE app_state RENAME TO app_state_v1_backup")
        .execute(pool)
        .await
        .map_err(|error| format!("No se pudo archivar la tabla antigua: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn pool() -> sqlx::PgPool {
        let url = std::env::var("TEST_DATABASE_URL")
            .expect("TEST_DATABASE_URL no definida (arranque un Postgres local)");
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .unwrap()
    }

    fn config() -> DbConfig {
        DbConfig {
            connection_string: std::env::var("TEST_DATABASE_URL").unwrap(),
        }
    }

    /// Guarda vía el comando real de Tauri y lee de vuelta.
    async fn save_and_load(
        cards: Vec<CardPayload>,
        workspaces: Vec<WorkspacePayload>,
        columns: Vec<ColumnPayload>,
        prefs: PrefsPayload,
    ) -> serde_json::Value {
        save_state_to_db(config(), cards, workspaces, columns, prefs)
            .await
            .unwrap();
        let raw = load_state_from_db(config()).await.unwrap().unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    /// Una única prueba serial: las tres fases comparten la misma DB y una
    /// fase prepara el estado que la siguiente asume.
    #[tokio::test]
    async fn db_lifecycle() {
        let pool = pool().await;
        let cfg = config();

        // --- Fase 1: DB física pero sin esquema → la carga devuelve None ---
        sqlx::query("DROP TABLE IF EXISTS app_state, app_state_v1_backup, cards, column_cards, columns, inbox_cards, prefs, workspaces, metadata")
            .execute(&pool).await.unwrap();
        let raw = load_state_from_db(cfg.clone()).await.unwrap();
        assert!(raw.is_none(), "DB sin esquema debe devolver None");
        let meta: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM metadata WHERE key='schema' AND value='2'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(meta.0, 1);

        // --- Fase 2: guardado y carga roundtrip preserva el estado ---
        let cards = vec![
            CardPayload { id: "c1".into(), title: "Primera".into(), description: "desc".into(), created_at: 123 },
            CardPayload { id: "c2".into(), title: "Segunda".into(), description: String::new(), created_at: 456 },
        ];
        let workspaces = vec![
            WorkspacePayload {
                id: "ws-a".into(), name: "Alpha".into(), color: "#ff0000".into(),
                inbox_card_ids: vec!["c2".into()],
                column_ids: vec!["col-a".into(), "col-b".into()],
            },
        ];
        let columns = vec![
            ColumnPayload { id: "col-a".into(), workspace_id: "ws-a".into(), title: "Por hacer".into(), card_ids: vec!["c1".into()] },
            ColumnPayload { id: "col-b".into(), workspace_id: "ws-a".into(), title: "Hecho".into(), card_ids: vec![] },
        ];
        let prefs = PrefsPayload { active_workspace_id: Some("ws-a".into()) };

        let state = save_and_load(cards, workspaces, columns, prefs).await;

        assert_eq!(state["workspaceIds"], json!(["ws-a"]));
        assert_eq!(state["activeWorkspaceId"], json!("ws-a"));
        assert_eq!(state["cards"]["c1"]["title"], json!("Primera"));
        assert_eq!(state["cards"]["c1"]["createdAt"], json!(123));
        assert_eq!(state["workspaces"]["ws-a"]["inboxCardIds"], json!(["c2"]));
        assert_eq!(state["columns"]["col-a"]["cardIds"], json!(["c1"]));
        assert_eq!(state["columns"]["col-b"]["cardIds"], json!([]));

        // --- Fase 3: migración v1 (blob) → v2 con archivado ---
        sqlx::query("TRUNCATE cards, workspaces, columns, prefs, metadata CASCADE")
            .execute(&pool).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS app_state_v1_backup")
            .execute(&pool).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS app_state")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE app_state (id INT PRIMARY KEY, data JSONB NOT NULL)")
            .execute(&pool).await.unwrap();
        let legacy = json!({
            "workspaceIds": ["w1"],
            "activeWorkspaceId": "w1",
            "workspaces": { "w1": { "id": "w1", "name": "Viejo", "color": "#123456",
                                    "columnIds": ["k1"], "inboxCardIds": ["k3"] } },
            "columns": { "k1": { "id": "k1", "title": "TODO", "cardIds": ["t1"] } },
            "cards": { "t1": { "id": "t1", "title": "Tarea", "description": "", "createdAt": 9 },
                       "k3": { "id": "k3", "title": "Suelta", "description": "", "createdAt": 8 } }
        });
        sqlx::query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)")
            .bind(legacy.to_string())
            .execute(&pool).await.unwrap();

        let raw = load_state_from_db(cfg).await.unwrap().unwrap();
        let legacy_state: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(legacy_state["workspaces"]["w1"]["name"], json!("Viejo"));
        assert_eq!(legacy_state["columns"]["k1"]["cardIds"], json!(["t1"]));
        assert_eq!(legacy_state["cards"]["t1"]["title"], json!("Tarea"));
        assert_eq!(legacy_state["workspaces"]["w1"]["inboxCardIds"], json!(["k3"]));

        let archived: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_state_v1_backup")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(archived, 1);

        // Tras migrar, un guardado normal v2 no repite la migración.
        save_state_to_db(
            config(),
            vec![CardPayload { id: "x".into(), title: "x".into(), description: String::new(), created_at: 1 }],
            vec![],
            vec![],
            PrefsPayload { active_workspace_id: None },
        )
        .await
        .unwrap();
        let reloaded: serde_json::Value =
            serde_json::from_str(&load_state_from_db(config()).await.unwrap().unwrap()).unwrap();
        assert_eq!(reloaded["workspaceIds"], json!([]));
        let arch2: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_state_v1_backup")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(arch2, 1, "no debe re-archivar");
    }
}
