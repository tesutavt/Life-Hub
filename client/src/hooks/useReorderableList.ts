import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type KeyGetter<T> = (item: T) => string | number;

type DraggableProps = {
  draggable: boolean;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: (event: React.DragEvent<HTMLElement>) => void;
};

type ContainerProps = {
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
};

const STORAGE_PREFIX = 'dragdrop-layout:';

const arraysEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const readStoredOrder = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry));
  } catch (error) {
    console.warn('[dragdrop] Failed to read layout from storage', error);
    return [];
  }
};

const writeStoredOrder = (key: string, value: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (value.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('[dragdrop] Failed to persist layout', error);
  }
};

export const useReorderableList = <T,>(
  containerId: string,
  items: readonly T[],
  getKey: KeyGetter<T>,
) => {
  const storageKey = `${STORAGE_PREFIX}${containerId}`;
  const initialOrderRef = useRef<string[] | null>(null);

  const ensureInitialOrder = () => {
    if (initialOrderRef.current) return initialOrderRef.current;
    const stored = readStoredOrder(storageKey);
    initialOrderRef.current = stored;
    return stored;
  };

  const [order, setOrder] = useState<string[]>(ensureInitialOrder);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const knownIds = useMemo(
    () => items.map((item) => String(getKey(item))),
    [items, getKey],
  );

  const persistOrder = useCallback((value: string[]) => {
    initialOrderRef.current = value;
    writeStoredOrder(storageKey, value);
  }, [storageKey]);

  useEffect(() => {
    setOrder((prev) => {
      const filtered = prev.filter((id) => knownIds.includes(id));
      const missing = knownIds.filter((id) => !filtered.includes(id));
      const next = [...filtered, ...missing];
      if (arraysEqual(prev, next)) return prev;
      persistOrder(next);
      return next;
    });
  }, [knownIds, persistOrder]);

  const idToItem = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) {
      map.set(String(getKey(item)), item);
    }
    return map;
  }, [items, getKey]);

  const orderedItems = useMemo(() => {
    if (order.length === 0 && knownIds.length > 0) {
      return knownIds
        .map((id) => idToItem.get(id))
        .filter((item): item is T => Boolean(item));
    }

    const normalized = order
      .map((id) => idToItem.get(id))
      .filter((item): item is T => Boolean(item));

    if (normalized.length === items.length) return normalized;

    const missing: T[] = [];
    for (const id of knownIds) {
      const item = idToItem.get(id);
      if (item && !normalized.includes(item)) {
        missing.push(item);
      }
    }

    return [...normalized, ...missing];
  }, [idToItem, items.length, knownIds, order]);

  const updateOrder = useCallback((updater: (prev: string[]) => string[]) => {
    setOrder((prev) => {
      const next = updater(prev);
      if (arraysEqual(prev, next)) return prev;
      persistOrder(next);
      return next;
    });
  }, [persistOrder]);

  const moveItem = useCallback((targetId: string) => {
    if (!activeId) return;
    updateOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(activeId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, activeId);
      return next;
    });
  }, [activeId, updateOrder]);

  const clearActive = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  const getDraggableProps = useCallback((rawId: string | number): DraggableProps => {
    const id = String(rawId);
    const draggable = order.length > 1;

    return {
      draggable,
      onDragStart: (event) => {
        if (!draggable) return;
        setActiveId(id);
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', id);
        } catch (error) {
          console.warn('[dragdrop] Unable to set drag data', error);
        }
      },
      onDragEnter: (event) => {
        if (!draggable) return;
        event.preventDefault();
        setOverId(id);
        if (!activeId || activeId === id) return;
        moveItem(id);
      },
      onDragOver: (event) => {
        if (!draggable) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event) => {
        if (!draggable) return;
        event.preventDefault();
        clearActive();
      },
      onDragLeave: (event) => {
        if (!draggable) return;
        event.preventDefault();
        setOverId((current) => (current === id ? null : current));
      },
      onDragEnd: () => {
        clearActive();
      },
    };
  }, [activeId, clearActive, moveItem, order.length]);

  const getContainerProps = useCallback((): ContainerProps => ({
    onDragOver: (event) => {
      event.preventDefault();
    },
    onDrop: (event) => {
      event.preventDefault();
      clearActive();
    },
    onDragLeave: (event) => {
      event.preventDefault();
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }
      setOverId(null);
    },
  }), [clearActive, setOverId]);
  const resetOrder = useCallback(() => {
    const next = [...knownIds];
    persistOrder(next);
    setOrder(next);
  }, [knownIds, persistOrder]);

  return {
    items: orderedItems,
    activeId,
    overId,
    getDraggableProps,
    getContainerProps,
    resetOrder,
  };
};

export type ReorderableListApi<T> = ReturnType<typeof useReorderableList<T>>;
