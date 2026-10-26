import { useEffect, useState } from 'react';

const STORAGE_KEY = 'balaraja-theme';

/**
 * Tema tampilan: 'light' | 'dark' | 'system'.
 *
 * Nilai disimpan di localStorage dan diterapkan ke elemen <html> lewat class
 * `dark`, yang dipakai styles/dark.css untuk menimpa nilai token.
 */
export function getTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage bisa diblokir (mode privat) — abaikan dan pakai system.
  }
  return 'system';
}

export function applyTheme(theme) {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Diabaikan: tema hanya hilang setelah reload.
  }
  applyTheme(theme);
}

export function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Pasang tema sebelum React mulai render, supaya tidak ada kedipan terang. */
export function initTheme() {
  const theme = getTheme();
  applyTheme(theme);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
}

/** Hook untuk komponen yang butuh tahu tema aktif saat ini. */
export function useTheme() {
  const [theme, setThemeState] = useState(getTheme);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, [theme]);

  return {
    theme,
    isDark,
    setTheme: (next) => {
      setTheme(next);
      setThemeState(next);
    },
    toggle: () => {
      const next = toggleTheme();
      setThemeState(next);
      return next;
    },
    // Alias yang sama dengan fungsi exported, supaya pemanggil tidak perlu
    // mengingat dua nama untuk hal yang sama.
    toggleTheme: () => {
      const next = toggleTheme();
      setThemeState(next);
      return next;
    },
  };
}
