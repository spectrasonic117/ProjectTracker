import { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Maximize2, Plus, Trash2, X } from 'lucide-react';
import type { CardData } from '../lib/types';
import { useBoard } from '../lib/store';
import { useConfirm } from '../lib/confirm';

export interface CardShellProps {
  card: CardData;
  /** Cuando se pasan, la tarjeta muestra acciones interactivas. */
  onEdit?: (cardId: string, fullscreen: boolean) => void;
}

/** Presentación de una tarjeta, reutilizada por el sortable y el DragOverlay. */
export function CardShell({ card, onEdit }: CardShellProps) {
  const { actions } = useBoard();
  const confirm = useConfirm();
  const interactive = Boolean(onEdit);

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const ok = await confirm({
      title: '¿Eliminar tarjeta?',
      message: `«${card.title || 'Sin título'}» se eliminará permanentemente.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok) actions.deleteCard(card.id);
  };

  return (
    <div className="group relative flex cursor-grab select-none items-start gap-1 rounded-xl border border-black/[.06] bg-white p-3 shadow-sm transition-shadow duration-150 hover:shadow-md active:cursor-grabbing dark:border-white/[.08] dark:bg-[#1c1c1e]">
      {interactive && (
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left outline-none"
          onClick={(event) => {
            // Evita abrir el editor cuando el click cierra un arrastre.
            if (event.detail === 0) return;
            onEdit?.(card.id, false);
          }}
        >
          <CardBody card={card} />
        </button>
      )}
      {!interactive && <CardBody card={card} />}

      {interactive && (
        <div className="flex flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            className="icon-btn"
            title="Editar a pantalla completa"
            aria-label="Editar a pantalla completa"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.(card.id, true);
            }}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            className="icon-btn hover:!text-[#ff375f] dark:hover:!text-[#ff5577]"
            title="Eliminar tarjeta"
            aria-label="Eliminar tarjeta"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleDelete}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function CardBody({ card }: { card: CardData }) {
  return (
    <div className="min-w-0">
      <p className="line-clamp-3 text-sm font-medium leading-snug break-words text-neutral-800 dark:text-neutral-100">
        {card.title || 'Sin título'}
      </p>
      {card.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed break-words text-neutral-500 dark:text-neutral-400">
          {card.description}
        </p>
      )}
    </div>
  );
}

interface SortableCardProps {
  card: CardData;
  /** Contenedor actual: id de columna o INBOX_ID. */
  containerId: string;
  onEdit: (cardId: string, fullscreen: boolean) => void;
}

export function SortableCard({ card, containerId, onEdit }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', containerId },
  });

  // Guarda dónde empezó el pulso para distinguir click de arrastre en el click final.
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        pointerDown.current = { x: event.clientX, y: event.clientY };
        listeners?.onPointerDown?.(event as unknown as PointerEvent);
      }}
      onClickCapture={(event) => {
        const origin = pointerDown.current;
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className={isDragging ? 'opacity-30' : undefined}
    >
      <CardShell card={card} onEdit={onEdit} />
    </div>
  );
}

interface CardComposerProps {
  onAdd: (title: string) => void;
  addLabel?: string;
  placeholder?: string;
}

/** Botón «+ Añadir tarjeta» que se convierte en un textarea inline. */
export function CardComposer({ onAdd, addLabel = 'Añadir tarjeta', placeholder = 'Título de la tarjeta…' }: CardComposerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = () => {
    const title = text.trim();
    if (title) onAdd(title);
    setText('');
  };

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer touch-none items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-neutral-500 outline-none transition-colors hover:bg-black/[.05] hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-accent/60 dark:text-neutral-400 dark:hover:bg-white/[.07] dark:hover:text-neutral-200"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} />
        {addLabel}
      </button>
    );
  }

  return (
    <div>
      <textarea
        autoFocus
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (!text.trim()) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            setText('');
            setOpen(false);
          }
        }}
        className="field resize-none"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button type="button" className="btn-primary" onMouseDown={(event) => event.preventDefault()} onClick={submit}>
          Añadir
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Cerrar"
          aria-label="Cerrar"
          onClick={() => {
            setText('');
            setOpen(false);
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
