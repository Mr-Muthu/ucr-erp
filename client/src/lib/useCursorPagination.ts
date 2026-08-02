import { useState } from 'react';

/** Manages a stack of cursors so "Previous" can step back through cursor-paginated list endpoints. */
export function useCursorPagination() {
  const [cursorStack, setCursorStack] = useState<string[]>([]); // cursors for pages before the current one
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  function goNext(nextCursor: string | null) {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, cursor ?? '']);
    setCursor(nextCursor);
  }

  function goPrev() {
    setCursorStack((stack) => {
      if (stack.length === 0) return stack;
      const copy = [...stack];
      const prev = copy.pop();
      setCursor(prev || undefined);
      return copy;
    });
  }

  function reset() {
    setCursorStack([]);
    setCursor(undefined);
  }

  return { cursor, hasPrev: cursorStack.length > 0, goNext, goPrev, reset };
}
