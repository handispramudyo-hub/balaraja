import { useEffect, useRef } from 'react';

/**
 * P-shortcut global.
 *
 * `keys` ditulis sebagai kombinasi tombol, contoh:
 *   'ctrl+k'      -> Ctrl/Cmd + K
 *   'f2'          -> tombol F2
 *   'ctrl+enter'  -> Ctrl/Cmd + Enter
 *
 * `handler` menerima event KeyboardEvent. Panggilan dicegah secara default
 * (event.preventDefault) supaya tidak memicu perilaku bawaan browser.
 */
export default function useHotkeys(map, { enabled = true, target } = {}) {
  const savedMap = useRef(map);
  savedMap.current = map;

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event) => {
      const parts = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      const key = event.key.toLowerCase();
      if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);

      const combo = parts.join('+');
      const action = savedMap.current[combo];
      if (!action) return;

      const element = target?.current ?? document;
      if (element !== document && !element.contains(document.activeElement)) return;

      event.preventDefault();
      action(event);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, target]);
}
