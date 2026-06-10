import { useEffect } from 'react';

export function useAdminTheme() {
  useEffect(() => {
    document.documentElement.classList.add('admin-theme');
    document.body.classList.add('admin-theme');
    return () => {
      document.documentElement.classList.remove('admin-theme');
      document.body.classList.remove('admin-theme');
    };
  }, []);
}
