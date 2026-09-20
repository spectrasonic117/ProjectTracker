import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'project-tracker/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Sin acceso a localStorage: el tema solo dura la sesión.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
