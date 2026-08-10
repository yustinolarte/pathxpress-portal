import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value.
 *
 * Rate and COD quotes used to be re-requested on every keystroke, so responses
 * could land out of order and leave a stale price on screen. Debouncing the
 * inputs collapses a burst of typing into a single request.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
