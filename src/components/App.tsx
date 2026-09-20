import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { CardData, ColumnData } from '../lib/types';
import { BoardProvider, getContainerCardIds, resolveContainer, useBoard } from '../lib/store';
import { useSidebar } from '../lib/useSidebar';
import { ConfirmProvider } from '../lib/confirm';
import { Sidebar } from './Sidebar';
import { Board } from './Board';
import { CardShell } from './Card';
import { CardEditor } from './CardEditor';

type ActiveDrag = { kind: 'card'; card: CardData } | { kind: 'column'; column: ColumnData };

interface EditingState {
  cardId: string;
  fullscreen: boolean;
}

export default function App() {
  return (
    <BoardProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </BoardProvider>
  );
}

function Shell() {
  const { state, actions } = useBoard();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const workspaceId = state.activeWorkspaceId;

  /**
   * Detección de colisiones según lo que se arrastra:
   * - Columna → solo contra otras columnas (orden horizontal).
   * - Tarjeta → contra tarjetas y contenedores (columnas e Inbox).
   */
  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      if (args.active.data.current?.type === 'column') {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (container) => container.data.current?.type === 'column',
          ),
        });
      }
      const collisions = pointerWithin(args);
      const candidates = collisions.length > 0 ? collisions : rectIntersection(args);
      return candidates.filter((collision) => {
        const type = collision.data?.droppableContainer.data.current?.type;
        return type === 'card' || type === 'column' || type === 'inbox';
      });
    },
    [],
  );

  const findContainer = useCallback(
    (id: string): string | null => (workspaceId ? resolveContainer(state, workspaceId, id) : null),
    [state, workspaceId],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const type = active.data.current?.type;
      if (type === 'card') {
        const card = state.cards[String(active.id)];
        if (card) setActiveDrag({ kind: 'card', card });
      } else if (type === 'column') {
        const column = state.columns[String(active.id)];
        if (column) setActiveDrag({ kind: 'column', column });
      }
    },
    [state],
  );

  // Mueve la tarjeta entre contenedores en vivo mientras se arrastra.
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !workspaceId || active.data.current?.type !== 'card') return;

      const activeContainer = findContainer(String(active.id));
      const overContainer = findContainer(String(over.id));
      if (!activeContainer || !overContainer || activeContainer === overContainer) return;

      let index: number | null = null;
      if (String(over.id) !== overContainer) {
        const position = getContainerCardIds(state, workspaceId, overContainer).indexOf(String(over.id));
        if (position >= 0) index = position;
      }
      actions.moveCard(String(active.id), overContainer, index);
    },
    [state, workspaceId, findContainer, actions],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);
      if (!over || !workspaceId) return;

      const type = active.data.current?.type;

      if (type === 'column') {
        if (active.id !== over.id) {
          const columnIds = state.workspaces[workspaceId].columnIds;
          const from = columnIds.indexOf(String(active.id));
          const to = columnIds.indexOf(String(over.id));
          if (from >= 0 && to >= 0) actions.moveColumn(workspaceId, from, to);
        }
        return;
      }

      if (type === 'card') {
        const activeContainer = findContainer(String(active.id));
        const overContainer = findContainer(String(over.id));
        if (
          activeContainer &&
          overContainer &&
          activeContainer === overContainer &&
          active.id !== over.id
        ) {
          const ids = getContainerCardIds(state, workspaceId, overContainer);
          const index = ids.indexOf(String(over.id));
          if (index >= 0) actions.moveCard(String(active.id), overContainer, index);
        }
      }
    },
    [state, workspaceId, findContainer, actions],
  );

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  const openEditor = useCallback((cardId: string, fullscreen: boolean) => {
    setEditing({ cardId, fullscreen });
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-dvh overflow-hidden bg-[#f5f5f7] text-neutral-900 dark:bg-[#0b0b0d] dark:text-neutral-100">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} onEditCard={openEditor} />
        <main
          className={`h-full min-w-0 flex-1 transition-[padding] duration-300 ease-out motion-reduce:transition-none ${
            sidebarCollapsed ? 'pl-16' : 'pl-72'
          }`}
        >
          <Board onEditCard={openEditor} />
        </main>
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
        {activeDrag?.kind === 'card' && (
          <div className="w-[262px] rotate-[2deg] scale-[1.03]">
            <CardShell card={activeDrag.card} />
          </div>
        )}
        {activeDrag?.kind === 'column' && (
          <div className="w-[288px] rotate-[1.5deg] rounded-2xl border border-black/[.06] bg-white/95 p-3.5 shadow-2xl backdrop-blur-xl dark:border-white/[.1] dark:bg-[#1c1c1e]/95">
            <p className="text-sm font-semibold tracking-[-.01em] text-neutral-700 dark:text-neutral-200">
              {activeDrag.column.title}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {activeDrag.column.cardIds.length} {activeDrag.column.cardIds.length === 1 ? 'tarjeta' : 'tarjetas'}
            </p>
          </div>
        )}
      </DragOverlay>

      {editing && (
        <CardEditor
          cardId={editing.cardId}
          fullscreen={editing.fullscreen}
          onToggleMode={() => setEditing((current) => (current ? { ...current, fullscreen: !current.fullscreen } : null))}
          onClose={() => setEditing(null)}
        />
      )}
    </DndContext>
  );
}
