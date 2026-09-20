import { useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndContext } from '@dnd-kit/core';
import { Pencil, Trash2 } from 'lucide-react';
import type { ColumnData } from '../lib/types';
import { resolveContainer, useBoard } from '../lib/store';
import { useConfirm } from '../lib/confirm';
import { CardComposer, SortableCard } from './Card';

interface ColumnViewProps {
  column: ColumnData;
  onEditCard: (cardId: string, fullscreen: boolean) => void;
}

export function ColumnView({ column, onEditCard }: ColumnViewProps) {
  const { state, actions } = useBoard();
  const confirm = useConfirm();
  const workspaceId = state.activeWorkspaceId;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  });
  const { active, over } = useDndContext();

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);

  const cards = column.cardIds.map((id) => state.cards[id]).filter(Boolean);
  const isDropTarget =
    workspaceId != null &&
    active?.data.current?.type === 'card' &&
    over != null &&
    resolveContainer(state, workspaceId, String(over.id)) === column.id;

  const commitRename = () => {
    const next = title.trim();
    if (next && next !== column.title) actions.renameColumn(column.id, next);
    else setTitle(column.title);
    setRenaming(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar columna?',
      message: `«${column.title}» se eliminará y sus ${cards.length} tarjeta(s) volverán al Inbox.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok && workspaceId) actions.deleteColumn(workspaceId, column.id);
  };

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex max-h-full w-[288px] shrink-0 flex-col rounded-2xl border border-black/[.05] bg-white/70 shadow-sm backdrop-blur-xl transition-colors duration-150 dark:border-white/[.07] dark:bg-white/[.04] ${
        isDragging ? 'opacity-40' : ''
      } ${isDropTarget ? 'border-accent/50 bg-accent/[.06]' : ''}`}
    >
      <header
        {...attributes}
        {...listeners}
        className="flex cursor-grab touch-none items-center gap-2 px-3.5 pb-2 pt-3.5 select-none active:cursor-grabbing"
        title="Arrastra para reordenar la columna"
      >
        {renaming ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') {
                setTitle(column.title);
                setRenaming(false);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="field flex-1 !py-1 text-sm font-semibold"
          />
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-.01em] text-neutral-700 dark:text-neutral-200">
              {column.title}
            </h3>
            <span className="rounded-full bg-black/[.05] px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-white/[.1] dark:text-neutral-400">
              {cards.length}
            </span>
            <div className="flex opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                className="icon-btn"
                title="Renombrar columna"
                aria-label="Renombrar columna"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setTitle(column.title);
                  setRenaming(true);
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                className="icon-btn hover:!text-[#ff375f] dark:hover:!text-[#ff5577]"
                title="Eliminar columna"
                aria-label="Eliminar columna"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete();
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-1">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} containerId={column.id} onEdit={onEditCard} />
          ))}
        </SortableContext>
        {cards.length === 0 && !isDropTarget && (
          <div className="grid h-16 shrink-0 place-items-center rounded-xl border border-dashed border-black/10 text-xs text-neutral-400 dark:border-white/10">
            Arrastra tarjetas aquí
          </div>
        )}
      </div>

      <div className="px-2.5 pb-2.5 pt-1">
        <CardComposer onAdd={(title) => workspaceId && actions.addCard(column.id, title)} />
      </div>
    </section>
  );
}
