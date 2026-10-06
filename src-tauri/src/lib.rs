use tauri_plugin_dialog::DialogExt;

mod db;

/// Shell nativo de ProjectTracker (Tauri 2). La interfaz es la misma web de Astro:
/// aquí solo viven las piezas que necesitan acceso al sistema operativo, como los
/// diálogos nativos de exportar/importar (en el navegador se hace con blob e
/// `<input type="file">`, que no funcionan igual dentro del webview).

/// Abre un diálogo de guardado nativo y escribe el JSON exportado.
/// Devuelve la ruta elegida, o `None` si el usuario canceló el diálogo.
#[tauri::command]
async fn export_state_json(
    app: tauri::AppHandle,
    contents: String,
    file_name: String,
) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(&file_name)
        .blocking_save_file();

    match file {
        Some(path) => {
            let path = path.into_path().map_err(|error| error.to_string())?;
            std::fs::write(&path, contents).map_err(|error| error.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

/// Abre un diálogo nativo para elegir un archivo JSON y devuelve su contenido.
/// Devuelve `None` si el usuario canceló el diálogo.
#[tauri::command]
async fn import_state_json(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    match file {
        Some(path) => {
            let path = path.into_path().map_err(|error| error.to_string())?;
            let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
            Ok(Some(contents))
        }
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            export_state_json,
            import_state_json,
            db::ping_neon,
            db::test_neon_connection,
            db::save_state_to_db,
            db::load_state_from_db
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación ProjectTracker");
}
