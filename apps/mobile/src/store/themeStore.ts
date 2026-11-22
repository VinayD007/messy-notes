import { create } from 'zustand';
import {
  DarkMessNoteColors,
  LightMessNoteColors,
  type MessyNotePalette,
} from '@messy-notes/shared';
import { getPreference, setPreference } from '../lib/mmkvStorage';

interface ThemeState {
  themeMode: 'dark' | 'light';
  isDark: boolean;
  palette: MessyNotePalette;
  toggleTheme: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
}

const initialMode = (getPreference('theme_mode') as 'dark' | 'light' | null) ?? 'dark';

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeMode: initialMode,
  isDark: initialMode === 'dark',
  palette: initialMode === 'dark' ? DarkMessNoteColors : LightMessNoteColors,

  toggleTheme: () => {
    const nextMode: 'dark' | 'light' = get().isDark ? 'light' : 'dark';
    setPreference('theme_mode', nextMode);
    set({
      themeMode: nextMode,
      isDark: nextMode === 'dark',
      palette: nextMode === 'dark' ? DarkMessNoteColors : LightMessNoteColors,
    });
  },

  setThemeMode: (mode: 'dark' | 'light') => {
    setPreference('theme_mode', mode);
    set({
      themeMode: mode,
      isDark: mode === 'dark',
      palette: mode === 'dark' ? DarkMessNoteColors : LightMessNoteColors,
    });
  },
}));
