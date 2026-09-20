import { useEffect, useRef, useState } from 'react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Check, Layers, Pencil, Plus, X } from 'lucide-react';
import { WORKSPACE_COLORS, countWorkspaceCards, useBoard } from '../lib/store';
import { ColumnView } from './Column';

interface BoardProps {
  onEditCard: (cardId: string, fullscreen: boolean) => void;
}

export function Board({ onEditCard }: BoardProps) {
  const { state } = useBoard();
  const workspace = state.activeWorkspaceId ? state.workspaces[state.activeWorkspaceId] : null;

  if (!workspace) return <EmptyBoard />;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <BoardHeader workspaceId={workspace.id} />
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-8 pb-6">
        <div className="flex h-full items-start gap-4">
          <SortableContext items={workspace.columnIds} strategy={horizontalListSortingStrategy}>
            {workspace.columnIds.map((columnId) => {
              const column = state.columns[columnId];
              return column ? <ColumnView key={columnId} column={column} onEditCard={onEditCard} /> : null;
            })}
          </SortableContext>
          <AddColumn workspaceId={workspace.id} />
        </div>
      </div>
    </div>
  );
}

function BoardHeader({ workspaceId }: { workspaceId: string }) {
  const { state, actions } = useBoard();
  const workspace = state.workspaces[workspaceId];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!workspace) return null;

  const columnCount = workspace.columnIds.length;
  const cardCount = countWorkspaceCards(state, workspaceId);

  const commit = () => {
    const next = name.trim();
    if (next && next !== workspace.name) actions.renameWorkspace(workspaceId, next);
    else setName(workspace.name);
    setRenaming(false);
  };

  return (
    <header className="flex items-center gap-3 px-8 pb-4 pt-6">
      <div className="relative shrink-0">
        <button
          type="button"
          className="block h-3.5 w-3.5 cursor-pointer rounded-full shadow-sm outline-none transition-transform duration-150 hover:scale-125 focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
          style={{ backgroundColor: workspace.color }}
          title="Cambiar color del proyecto"
          aria-label="Cambiar color del proyecto"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        />
        {pickerOpen && (
          <WorkspaceColorPicker workspaceId={workspaceId} color={workspace.color} onClose={() => setPickerOpen(false)} />
        )}
      </div>
      {renaming ? (
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              setName(workspace.name);
              setRenaming(false);
            }
          }}
          className="field max-w-md !py-1 text-xl font-bold"
        />
      ) : (
        <h2 className="truncate text-xl font-bold tracking-[-.02em]">{workspace.name}</h2>
      )}
      <button
        type="button"
        className="icon-btn"
        title="Renombrar espacio de trabajo"
        aria-label="Renombrar espacio de trabajo"
        onClick={() => {
          setName(workspace.name);
          setRenaming(true);
        }}
      >
        <Pencil size={13} />
      </button>
      <p className="ml-auto shrink-0 text-[13px] text-neutral-400 dark:text-neutral-500">
        {columnCount} {columnCount === 1 ? 'columna' : 'columnas'} · {cardCount} {cardCount === 1 ? 'tarjeta' : 'tarjetas'}
      </p>
    </header>
  );
}

function AddColumn({ workspaceId }: { workspaceId: string }) {
  const { actions } = useBoard();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const submit = () => {
    const next = title.trim();
    if (next) {
      actions.addColumn(workspaceId, next);
      setTitle('');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-[288px] shrink-0 cursor-pointer touch-none items-center gap-2 rounded-2xl border border-dashed border-black/10 px-4 py-3 text-sm font-medium text-neutral-500 outline-none transition-colors hover:border-black/25 hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-accent/60 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/25 dark:hover:bg-white/[.05]"
        onClick={() => setOpen(true)}
      >
        <Plus size={15} />
        Añadir columna
      </button>
    );
  }

  return (
    <form
      className="w-[288px] shrink-0 rounded-2xl border border-black/[.05] bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-white/[.07] dark:bg-white/[.04]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        value={title}
        placeholder="Nombre de la columna"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setTitle('');
            setOpen(false);
          }
        }}
        className="field"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <button type="submit" className="btn-primary" onMouseDown={(event) => event.preventDefault()}>
          Añadir
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Cancelar"
          aria-label="Cancelar"
          onClick={() => {
            setTitle('');
            setOpen(false);
          }}
        >
          <X size={14} />
        </button>
      </div>
    </form>
  );
}

/** Popover anclado al punto de color: paleta predefinida + color personalizado. */
function WorkspaceColorPicker({
  workspaceId,
  color,
  onClose,
}: {
  workspaceId: string;
  color: string;
  onClose: () => void;
}) {
  const { actions } = useBoard();
  const ref = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic fuera o con Escape; el punto que lo abre gestiona su propio toggle.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (ref.current?.contains(event.target as Node)) return;
      if (target?.closest?.('button[aria-label="Cambiar color del proyecto"]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const pick = (next: string) => actions.setWorkspaceColor(workspaceId, next);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Color del proyecto"
      className="pop-in absolute top-full left-0 z-50 mt-2.5 w-56 rounded-2xl border border-black/[.06] bg-white p-3 shadow-xl dark:border-white/[.08] dark:bg-[#1c1c1e]"
    >
      <p className="text-[11px] font-semibold tracking-[.06em] text-neutral-400 uppercase">Color del proyecto</p>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {WORKSPACE_COLORS.map((preset) => {
          const selected = color.toLowerCase() === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              title={preset}
              aria-label={`Usar color ${preset}`}
              aria-pressed={selected}
              onClick={() => {
                pick(preset);
                onClose();
              }}
              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white shadow-sm outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 ${
                selected ? 'ring-2 ring-neutral-400 ring-offset-2 dark:ring-neutral-500' : ''
              }`}
              style={{ backgroundColor: preset }}
            >
              {selected && <Check size={13} />}
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/10 px-2.5 py-2 transition-colors hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.05]">
        <input
          type="color"
          value={color}
          onChange={(event) => pick(event.target.value)}
          className="color-swatch"
          title="Color personalizado"
        />
        <span className="text-[13px] font-medium">Personalizado</span>
        <span className="ml-auto font-mono text-[11px] text-neutral-400">{color.toUpperCase()}</span>
      </label>
    </div>
  );
}

function EmptyBoard() {  const { state, actions } = useBoard();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const hasWorkspaces = state.workspaceIds.length > 0;

  const submit = () => {
    const next = name.trim();
    if (next) {
      actions.addWorkspace(next);
      setName('');
    }
  };

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-black/[.05] text-neutral-400 dark:bg-white/[.06]">
          <Layers size={24} />
        </div>
        <h2 className="mt-4 text-lg font-bold tracking-[-.01em]">
          {hasWorkspaces ? 'Selecciona un espacio de trabajo' : 'Crea tu primer espacio de trabajo'}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {hasWorkspaces
            ? 'Elige uno en la barra lateral para ver su tablero.'
            : 'Cada proyecto vive en su propio espacio, con sus columnas y su Inbox.'}
        </p>
        {!hasWorkspaces && (
          <form
            className="mt-5 flex justify-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {creating ? (
              <>
                <input
                  autoFocus
                  value={name}
                  placeholder="Nombre del proyecto"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && setCreating(false)}
                  className="field w-52"
                />
                <button type="submit" className="btn-primary shrink-0">
                  Crear
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <Plus size={14} />
                Nuevo espacio de trabajo
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
