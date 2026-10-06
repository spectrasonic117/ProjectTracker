use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;

/// Configuración para conectarse a la base de datos externa (Neon).
/// El frontend envía la cadena de conexión desde el diálogo de Ajustes.
#[derive(Serialize, Deserialize, Clone)]
pub struct DbConfig {
    #[serde(rename = "connectionString")]
    pub connection_string: String,
}

/// Crea un pool de conexiones corto para la operación puntual.
async fn connect(config: &DbConfig) -> Result<sqlx::PgPool, String> {
    PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(12))
        .connect(&config.connection_string)
        .await
        .map_err(|error| format!("No se pudo conectar a la base de datos: {error}"))
}

/// Envía una query trivial para "despertar" una base de datos suspendida
/// y prevenir la suspensión por inactividad (planes gratuitos de Neon).
#[tauri::command]
pub async fn ping_neon(config: DbConfig) -> Result<(), String> {
    let pool = connect(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|error| format!("Error al hacer ping a la base de datos: {error}"))?;
    Ok(())
}

/// Comprueba que la cadena de conexión a Neon es válida.
#[tauri::command]
pub async fn test_neon_connection(config: DbConfig) -> Result<(), String> {
    ping_neon(config).await
}

/// Garantiza que la tabla de estado existe (idempotente).
async fn ensure_table(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS app_state (
            id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|error| format!("No se pudo preparar la tabla app_state: {error}"))?;
    Ok(())
}

/// Guarda el estado completo de la app como un único registro JSONB (upsert).
#[tauri::command]
pub async fn save_state_to_db(config: DbConfig, data: String) -> Result<(), String> {
    let pool = connect(&config).await?;
    ensure_table(&pool).await?;

    sqlx::query(
        r#"
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        "#,
    )
    .bind(data)
    .execute(&pool)
    .await
    .map_err(|error| format!("No se pudo guardar el estado en la base de datos: {error}"))?;
    Ok(())
}

/// Carga el estado guardado. Devuelve `None` si todavía no hay datos en la DB.
#[tauri::command]
pub async fn load_state_from_db(config: DbConfig) -> Result<Option<String>, String> {
    let pool = connect(&config).await?;
    ensure_table(&pool).await?;

    let row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT data FROM app_state WHERE id = 1")
            .fetch_optional(&pool)
            .await
            .map_err(|error| format!("No se pudo leer el estado de la base de datos: {error}"))?;

    match row {
        Some((value,)) => serde_json::to_string(&value)
            .map(Some)
            .map_err(|error| format!("No se pudo serializar el estado: {error}")),
        None => Ok(None),
    }
}
