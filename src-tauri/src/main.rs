// Evita que las compilaciones release abran una ventana de consola en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    project_tracker_lib::run()
}
