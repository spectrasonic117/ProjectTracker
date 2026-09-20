import { useEffect, useRef } from 'react';
import { Maximize2, Minimize2, Trash2, X } from 'lucide-react';
import { useBoard } from '../lib/store';
import { useConfirm } from '../lib/confirm';

interface CardEditorProps {
  cardId: string;
  fullscreen: boolean;
  onToggleMode: () => void;
  onClose: () => void;
}

export function CardEditor({ cardId, fullscreen, onToggleMode, onClose }: CardEditorProps) {
  const { state, actions } = useBoard();
  const confirm = useConfirm();
  const card = state.cards[cardId];
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [fullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!card) return null;

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar tarjeta?',
      message: `«${card.title || 'Sin título'}» se eliminará permanentemente.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok) {
      actions.deleteCard(cardId);
      onClose();
    }
  };

  const createdLabel = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    card.createdAt,
  );

  const body = (
    <div className={`flex flex-col ${fullscreen ? 'h-full' : ''}`}>
      <header className="flex items-center gap-2">
        <button
          type="button"
          className="icon-btn"
          title={fullscreen ? 'Vista compacta' : 'Pantalla completa'}
          aria-label={fullscreen ? 'Vista compacta' : 'Pantalla completa'}
          onClick={onToggleMode}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <span className="text-[11px] font-semibold tracking-[.06em] text-neutral-400 uppercase">Editar tarjeta</span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="icon-btn hover:!text-[#ff375f] dark:hover:!text-[#ff5577]"
            title="Eliminar tarjeta"
            aria-label="Eliminar tarjeta"
            onClick={() => void handleDelete()}
          >
            <Trash2 size={14} />
          </button>
          <button type="button" className="icon-btn" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>

      <input
        ref={titleRef}
        value={card.title}
        placeholder="Título de la tarjeta"
        onChange={(event) => actions.updateCard(cardId, { title: event.target.value })}
        className="mt-4 w-full bg-transparent text-2xl font-bold tracking-[-.02em] text-neutral-900 outline-none placeholder:text-neutral-300 focus:outline-none dark:text-neutral-50 dark:placeholder:text-neutral-600"
      />
      <textarea
        value={card.description}
        placeholder="Añade una descripción… (⌘↵ para cerrar)"
        rows={fullscreen ? undefined : 6}
        onChange={(event) => actions.updateCard(cardId, { description: event.target.value })}
        className={`field mt-3 resize-none leading-relaxed ${fullscreen ? 'min-h-0 flex-1' : ''}`}
      />
      <footer className="mt-4 flex items-center gap-3">
        <span className="text-xs text-neutral-400 dark:text-neutral-500">Creada el {createdLabel}</span>
        <button type="button" className="btn-primary ml-auto" onClick={onClose}>
          Listo
        </button>
      </footer>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fade-in fixed inset-0 z-50 bg-[#f5f5f7]/90 backdrop-blur-2xl dark:bg-black/85"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-8 md:py-12">{body}</div>
      </div>
    );
  }

  return (
    <div
      className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/25 p-6 backdrop-blur-sm dark:bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pop-in w-full max-w-xl rounded-3xl border border-black/[.06] bg-white p-6 shadow-2xl dark:border-white/[.08] dark:bg-[#1c1c1e]">
        {body}
      </div>
    </div>
  );
}
