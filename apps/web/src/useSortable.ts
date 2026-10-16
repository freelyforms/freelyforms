import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** Pixels the pointer must move before a press on the handle becomes a drag. */
const THRESHOLD = 5;
/** Distance from the viewport edge where auto-scroll starts, and its top speed per frame. */
const EDGE = 100;
const MAX_SPEED = 18;

/**
 * Index an item ends up at when it is taken out of position `from` and inserted before the item
 * that was at `insertAt` (`insertAt` = length means at the end).
 */
export const finalIndex = (from: number, insertAt: number) =>
  insertAt > from ? insertAt - 1 : insertAt;

export interface DragState {
  id: string;
  /** Pointer position, for the ghost. */
  x: number;
  y: number;
  /** Insertion index in the current list (0..length): the line is drawn before this item. */
  insertAt: number;
}

/**
 * Pointer-based list reordering (mouse, pen and touch) with an insertion line, a ghost, edge
 * auto-scroll and Esc to cancel. `onMove(id, toIndex)` receives the final index after removal.
 */
export function useSortable(ids: readonly string[], onMove: (id: string, toIndex: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const pending = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null);
  const live = useRef<DragState | null>(null);
  const idsRef = useRef(ids);
  const onMoveRef = useRef(onMove);
  useLayoutEffect(() => {
    idsRef.current = ids;
    onMoveRef.current = onMove;
  });

  /** Registers a list item's element (use as a ref callback). */
  const itemRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) items.current.set(id, el);
      else items.current.delete(id);
    },
    [],
  );

  const insertionFor = (y: number, dragged: string): number => {
    const list = idsRef.current;
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      if (id === undefined || id === dragged) continue;
      const rect = items.current.get(id)?.getBoundingClientRect();
      if (rect && y < rect.top + rect.height / 2) return i;
    }
    return list.length;
  };

  const update = (next: DragState | null) => {
    live.current = next;
    setDrag(next);
  };

  /** Starts tracking a press on a handle. */
  const onHandlePointerDown = (id: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (synthetic events); window listeners still track it.
    }
    pending.current = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  useEffect(() => {
    let frame = 0;
    let lastY = 0;

    const autoScroll = () => {
      const state = live.current;
      if (!state) return;
      const h = window.innerHeight;
      const speed =
        lastY < EDGE
          ? -MAX_SPEED * ((EDGE - lastY) / EDGE)
          : lastY > h - EDGE
            ? MAX_SPEED * ((lastY - (h - EDGE)) / EDGE)
            : 0;
      if (speed !== 0) {
        window.scrollBy(0, speed);
        update({ ...state, insertAt: insertionFor(lastY, state.id) });
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      lastY = e.clientY;
      const state = live.current;
      if (!state) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return;
        update({ id: p.id, x: e.clientX, y: e.clientY, insertAt: insertionFor(e.clientY, p.id) });
        frame = requestAnimationFrame(autoScroll);
        return;
      }
      update({ ...state, x: e.clientX, y: e.clientY, insertAt: insertionFor(e.clientY, state.id) });
    };

    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      const state = live.current;
      pending.current = null;
      update(null);
      if (!commit || !state) return;
      const from = idsRef.current.indexOf(state.id);
      const to = finalIndex(from, state.insertAt);
      if (from >= 0 && to !== from) onMoveRef.current(state.id, to);
    };

    const up = (e: PointerEvent) => {
      if (pending.current && e.pointerId === pending.current.pointerId) finish(true);
    };
    const cancel = () => {
      if (pending.current) finish(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && live.current) {
        e.preventDefault();
        finish(false);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, []);

  return { drag, itemRef, onHandlePointerDown };
}
