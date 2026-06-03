import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from 'firebase/auth';

export interface AppUser {
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  allowedTabs?: Record<string, boolean>;
  photoURL?: string;
}

interface AuthState {
  firebaseUser: User | null;
  appUser: AppUser | null;
  authLoading: boolean;
  loginError: string | null;
  isDarkMode: boolean;
  language: 'en' | 'he' | 'fr' | 'de' | 'es' | 'nl' | 'is';

  setFirebaseUser: (user: User | null) => void;
  setAppUser: (user: AppUser | null) => void;
  setAuthLoading: (val: boolean) => void;
  setLoginError: (err: string | null) => void;
  toggleDarkMode: () => void;
  setLanguage: (lang: AuthState['language']) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      firebaseUser: null,
      appUser: null,
      authLoading: true,
      loginError: null,
      isDarkMode: true,
      language: 'he',

      setFirebaseUser: (user) => set({ firebaseUser: user }),
      setAppUser: (user) => set({ appUser: user }),
      setAuthLoading: (val) => set({ authLoading: val }),
      setLoginError: (err) => set({ loginError: err }),

      toggleDarkMode: () => {
        const next = !get().isDarkMode;
        set({ isDarkMode: next });
        if (next) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      },

      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        isDarkMode: s.isDarkMode,
        language: s.language,
      }),
    },
  ),
);
