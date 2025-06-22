import { useEffect } from 'react';
import { useAppSelector } from '../store/hooks';

export const useDarkMode = () => {
  const theme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return theme;
};