# Repository Guidelines

## Project Overview
A Trello-style project board application built as a hybrid web and desktop experience. It features a React-based frontend using Astro and a native desktop shell powered by Tauri (Rust).

## Architecture & Data Flow
The application follows a **Single Source of Truth** pattern centered around a centralized `AppState` object.

*   **State Management:** Managed via a normalized `useReducer` pattern within a `BoardProvider` (React Context API). Domain logic (adding/moving/deleting items) resides in the reducer in `src/lib/store.tsx`.
*   **Frontend-Backend Bridge:** Communication occurs via Tauri's `invoke` mechanism. The Rust layer acts as a high-privilege proxy for system tasks (file dialogs) and database operations.
*   **Data Persistence:** 
    *   **Local:** State is serialized to JSON and stored in `localStorage` (`project-tracker/state/v1`). Sensitive configuration is encrypted via **AES-GCM**.
    *   **Remote:** The entire `AppState` is sent as a JSON string to the Rust backend, which performs a single `UPSERT` operation into a PostgreSQL `JSONB` column (optimized for Neon/cloud hosting).
*   **Data Modeling:** Uses a relational-in-memory model. Objects (workspaces, columns, cards) are stored in maps indexed by ID to facilitate fast lookups and avoid deep nesting.

## Key Directories
*   `src/lib/`: Core domain logic (types, state/reducer, storage abstraction, theme).
*   `src/components/`: React UI components (Board, Column, Card, Sidebar, etc.).
*   `src/pages/`: Astro pages and routing.
*   `src-tauri/src/`: Rust backend implementation (Tauri commands, database management).
*   `src-tauri/`: Desktop application configuration and build assets.

## Development Commands

| Command | Description |
| :--- | :--- |
| `bun run dev` | Start local Astro development server (`http://localhost:4321`). |
| `bun run desktop:dev` | Launch the native Tauri desktop window with live reload. |
| `bun run check` | Run TypeScript and Astro type-checking. |
| `bun run build` | Build the Astro frontend for production. |
| `bun run desktop:build` | Compile the full native desktop release. |
| `bunx tauri icon <path>` | Regenerate platform icons from an SVG. |

## Code Conventions & Common Patterns
*   **State Updates:** Always use the centralized reducer in `src/lib/store.tsx`. Avoid local component state for shared domain data.
*   **Data Access:** Use the `useBoard()` hook to access the current state and dispatch actions.
*   **Naming Patterns:**
    *   React components: PascalCase (e.g., `CardEditor.tsx`).
    *   Hooks: camelCase with `use` prefix (e.g., `useSidebar.ts`).
    *   Types: PascalCase (e.g., `WorkspaceData`).
*   **Async Patterns:** Frontend-to-backend communication is handled via `invoke` calls. Persistence logic is abstracted in `src/lib/storage.ts`.
*   **Error Handling:** Frontend relies on TypeScript for static safety; backend uses Rust's robust error handling for database and system operations.

## Important Files
*   `src/lib/store.tsx`: The application "Brain" (reducer and context).
*   `src/lib/types.ts`: Fundamental domain models and `AppState` definition.
*   `src/lib/storage.ts`: The storage dispatcher (Local vs. Remote).
*   `src-tauri/src/db.rs`: PostgreSQL connection and schema management.
*   `src-tauri/src/lib.rs`: Tauri command registration and gateway.
*   `astro.config.mjs`: Astro and Vite configuration.
*   `tauri.conf.json`: Tauri desktop configuration.

## Runtime/Tooling Preferences
*   **Runtime:** [Bun](https://bun.sh/)
*   **Package Manager:** Bun
*   **Frontend Framework:** Astro + React
*   **Styling:** Tailwind CSS v4
*   **Drag & Drop:** `dnd-kit`
*   **Desktop Shell:** Tauri 2 (Rust)

## Testing & QA
*   **Frontend:** Static analysis via `bun run check` (Astro/TypeScript). No automated unit test suite is currently implemented.
*   **Backend:** Native Rust testing via `cargo test`.
