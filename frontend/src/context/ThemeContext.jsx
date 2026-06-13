import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, getInitialTheme } from '../utils/theme.js';

const STORAGE_KEY = 'safex-theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const isDark = theme !== 'light';

  const value = useMemo(
    () => ({ theme, isDark, setTheme, toggleTheme }),
    [theme, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
