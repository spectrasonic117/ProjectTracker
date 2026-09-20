import { useCallback, useState } from 'react';

const SIDEBAR_KEY = 'project-tracker/sidebar';

/** Estado contraído/expandido de la barra lateral, persistido en localStorage. */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        // Sin localStorage: el estado solo dura la sesión.
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
