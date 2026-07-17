import { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

/** Applies admin-theme + syncs dark/light so html/body bg never flash white under the shell. */
export function useAdminTheme() {
  const { isDark } = useTheme();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('admin-theme');
    body.classList.add('admin-theme');
    return () => {
      html.classList.remove('admin-theme');
      body.classList.remove('admin-theme');
      html.style.removeProperty('background-color');
      body.style.removeProperty('background-color');
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const bg = isDark ? '#000000' : '#fafafa';
    html.style.backgroundColor = bg;
    body.style.backgroundColor = bg;
    html.classList.toggle('dark', isDark);
    body.classList.toggle('dark', isDark);
    html.classList.toggle('light', !isDark);
    body.classList.toggle('light', !isDark);
  }, [isDark]);
}
