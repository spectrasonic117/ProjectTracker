import { useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  FileDown,
  FileUp,
  Inbox as InboxIcon,
  Layers,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import { INBOX_ID } from '../lib/types';
import { parseState } from '../lib/storage';
import { useBoard } from '../lib/store';
import { useConfirm } from '../lib/confirm';
import { useTheme } from '../lib/useTheme';
import { CardComposer, SortableCard } from './Card';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onEditCard: (cardId: string, fullscreen: boolean) => void;
}

export function Sidebar({ collapsed, onToggle, onEditCard }: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 overflow-hidden border-r border-black/[.06] bg-white/70 backdrop-blur-2xl transition-[width] duration-300 ease-out motion-reduce:transition-none dark:border-white/[.08] dark:bg-[#151517]/70 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      {collapsed ? (
        <CollapsedRail onToggle={onToggle} />
      ) : (
        <div className="flex h-full w-72 flex-col">
          <SidebarHeader onToggle={onToggle} />
          <WorkspacesSection />
          <InboxSection onEditCard={onEditCard} />
          <SidebarFooter />
        </div>
      )}
    </aside>
  );
}

/** Contenido expandido: marca + botón de contraer arriba, utilidades abajo. */
function SidebarHeader({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-[#0a84ff] to-[#0060df] text-white shadow-sm">
        <Layers size={15} />
      </div>
      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-.01em]">ProjectTracker</h1>
      <button
        type="button"
        className="icon-btn"
        title="Contraer barra lateral"
        aria-label="Contraer barra lateral"
        onClick={onToggle}
      >
        <PanelLeftClose size={15} />
      </button>
    </div>
  );
}

/** Contenido contraído: marca, botón de expandir y los espacios como círculos con su inicial. */
function CollapsedRail({ onToggle }: { onToggle: () => void }) {
  const { state, actions } = useBoard();

  return (
    <div className="flex h-full w-16 flex-col items-center pt-4">
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-[#0a84ff] to-[#0060df] text-white shadow-sm"
        title="ProjectTracker"
      >
        <Layers size={15} />
      </div>
      <button
        type="button"
        className="icon-btn mt-2"
        title="Expandir barra lateral"
        aria-label="Expandir barra lateral"
        onClick={onToggle}
      >
        <PanelLeftOpen size={16} />
      </button>

      <div className="mt-4 flex flex-col items-center gap-2" role="list" aria-label="Espacios de trabajo">
        {state.workspaceIds.map((workspaceId) => {
          const workspace = state.workspaces[workspaceId];
          if (!workspace) return null;
          const isActive = workspaceId === state.activeWorkspaceId;
          const initial = (workspace.name.trim()[0] ?? '·').toUpperCase();
          return (
            <button
              key={workspaceId}
              type="button"
              role="listitem"
              title={workspace.name}
              aria-label={`Espacio de trabajo ${workspace.name}`}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => actions.setActiveWorkspace(workspaceId)}
              className={`grid h-9 w-9 shrink-0 cursor-pointer touch-none place-items-center rounded-full text-[13px] font-semibold text-white shadow-sm outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 ${
                isActive
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-transparent'
                  : 'opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: workspace.color }}
            >
              {initial}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Utilidades al pie: importar, exportar y tema. Solo visible con la barra expandida. */
function SidebarFooter() {
  const { theme, toggle } = useTheme();
  const { state, actions } = useBoard();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Descarga todo el estado de la app como archivo JSON. */
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `project-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const imported = parseState(await file.text());
    if (!imported) {
      await confirm({
        mode: 'alert',
        title: 'Archivo no válido',
        message:
          'El archivo no tiene el formato de datos de ProjectTracker. Exporta un JSON desde esta app e inténtalo de nuevo.',
        confirmLabel: 'Aceptar',
      });
      return;
    }
    const workspaceCount = imported.workspaceIds.length;
    const cardCount = Object.keys(imported.cards).length;
    const ok = await confirm({
      title: '¿Importar estos datos?',
      message: `El archivo contiene ${workspaceCount} ${
        workspaceCount === 1 ? 'espacio de trabajo' : 'espacios de trabajo'
      } y ${cardCount} ${cardCount === 1 ? 'tarjeta' : 'tarjetas'}. Tus datos actuales se reemplazarán.`,
      confirmLabel: 'Importar',
      danger: true,
    });
    if (ok) actions.importState(imported);
  };

  return (
    <footer className="flex shrink-0 items-center gap-1 border-t border-black/[.06] px-4 py-2.5 dark:border-white/[.08]">
      <button
        type="button"
        className="icon-btn"
        title="Importar datos (JSON)"
        aria-label="Importar datos (JSON)"
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Exportar datos (JSON)"
        aria-label="Exportar datos (JSON)"
        onClick={handleExport}
      >
        <FileDown size={15} />
      </button>
      <button
        type="button"
        className="icon-btn ml-auto"
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        aria-label="Cambiar tema"
        onClick={toggle}
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          // Permite volver a elegir el mismo archivo más adelante.
          event.target.value = '';
        }}
      />
    </footer>
  );
}

function WorkspacesSection() {
  const { state, actions } = useBoard();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const submitAdd = () => {
    const next = name.trim();
    if (next) {
      actions.addWorkspace(next);
      setName('');
      setAdding(false);
    }
  };

  const commitRename = (workspaceId: string, original: string) => {
    const next = renameText.trim();
    if (next && next !== original) actions.renameWorkspace(workspaceId, next);
    setRenamingId(null);
  };

  const handleDelete = async (workspaceId: string, name: string) => {
    const ok = await confirm({
      title: '¿Eliminar espacio de trabajo?',
      message: `Se eliminará «${name}» con todas sus columnas, tarjetas e Inbox. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok) actions.deleteWorkspace(workspaceId);
  };

  return (
    <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col px-3" aria-label="Espacios de trabajo">
      <header className="flex items-center gap-2 px-2 py-2">
        <h2 className="text-[11px] font-semibold tracking-[.06em] text-neutral-400 uppercase">Espacios de trabajo</h2>
        <button
          type="button"
          className="icon-btn ml-auto !h-6 !w-6"
          title="Nuevo espacio de trabajo"
          aria-label="Nuevo espacio de trabajo"
          onClick={() => setAdding(true)}
        >
          <Plus size={13} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
        {state.workspaceIds.map((workspaceId) => {
          const workspace = state.workspaces[workspaceId];
          if (!workspace) return null;
          const isActive = workspaceId === state.activeWorkspaceId;

          if (renamingId === workspaceId) {
            return (
              <input
                key={workspaceId}
                autoFocus
                value={renameText}
                onChange={(event) => setRenameText(event.target.value)}
                onFocus={(event) => event.target.select()}
                onBlur={() => commitRename(workspaceId, workspace.name)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename(workspaceId, workspace.name);
                  if (event.key === 'Escape') setRenamingId(null);
                }}
                className="field !py-1.5 text-[13px]"
              />
            );
          }

          return (
            <div key={workspaceId} className="group relative">
              <button
                type="button"
                onClick={() => actions.setActiveWorkspace(workspaceId)}
                className={`flex w-full cursor-pointer touch-none items-center gap-2.5 rounded-xl py-2 pr-16 pl-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  isActive
                    ? 'bg-black/[.06] font-semibold dark:bg-white/[.09] dark:font-medium'
                    : 'font-medium hover:bg-black/[.03] dark:hover:bg-white/[.05]'
                }`}
                aria-current={isActive ? 'true' : undefined}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: workspace.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-left">{workspace.name}</span>
              </button>
              <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  className="icon-btn !h-6 !w-6"
                  title="Renombrar"
                  aria-label={`Renombrar ${workspace.name}`}
                  onClick={() => {
                    setRenameText(workspace.name);
                    setRenamingId(workspaceId);
                  }}
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  className="icon-btn !h-6 !w-6 hover:!text-[#ff375f] dark:hover:!text-[#ff5577]"
                  title="Eliminar"
                  aria-label={`Eliminar ${workspace.name}`}
                  onClick={() => void handleDelete(workspaceId, workspace.name)}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}

        {adding && (
          <form
            className="flex items-center gap-1.5 px-0.5 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              submitAdd();
            }}
          >
            <input
              autoFocus
              value={name}
              placeholder="Nombre del proyecto"
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (!name.trim()) setAdding(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setName('');
                  setAdding(false);
                }
              }}
              className="field !py-1.5 text-[13px]"
            />
            <button type="submit" className="icon-btn shrink-0" title="Crear" aria-label="Crear espacio de trabajo">
              <Plus size={14} />
            </button>
          </form>
        )}

        {!adding && state.workspaceIds.length === 0 && (
          <p className="px-2 py-2 text-xs leading-relaxed text-neutral-400">
            Sin espacios todavía. Crea uno con el botón <span className="font-semibold">+</span>.
          </p>
        )}
      </div>
    </section>
  );
}

function InboxSection({ onEditCard }: { onEditCard: (cardId: string, fullscreen: boolean) => void }) {
  const { state, actions } = useBoard();
  const workspace = state.activeWorkspaceId ? state.workspaces[state.activeWorkspaceId] : null;
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_ID, data: { type: 'inbox' } });

  const cardIds = workspace?.inboxCardIds ?? [];

  return (
    <section className="flex min-h-0 flex-1 flex-col px-3 pb-4" aria-label="Inbox">
      <header className="flex items-center gap-2 px-2 py-2">
        <InboxIcon size={13} className="shrink-0 text-neutral-400" />
        <h2 className="text-[11px] font-semibold tracking-[.06em] text-neutral-400 uppercase">Inbox</h2>
        <span className="ml-auto rounded-full bg-black/[.06] px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-white/[.1] dark:text-neutral-400">
          {cardIds.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl p-1 transition-colors duration-150 ${
          isOver ? 'bg-accent/10 ring-2 ring-accent/50' : ''
        }`}
      >
        {workspace ? (
          <>
            <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
              {cardIds.map((cardId) => {
                const card = state.cards[cardId];
                return card ? (
                  <SortableCard key={cardId} card={card} containerId={INBOX_ID} onEdit={onEditCard} />
                ) : null;
              })}
            </SortableContext>
            {cardIds.length === 0 && !isOver && (
              <p className="px-2 py-2 text-xs leading-relaxed text-neutral-400">
                Sin tarjetas. Crea una aquí o arrastra tarjetas desde el tablero.
              </p>
            )}
            <CardComposer onAdd={(title) => actions.addCard(INBOX_ID, title)} addLabel="Añadir tarjeta al Inbox" />
          </>
        ) : (
          <p className="px-2 py-2 text-xs leading-relaxed text-neutral-400">
            Selecciona un espacio de trabajo para usar su Inbox.
          </p>
        )}
      </div>
    </section>
  );
}
