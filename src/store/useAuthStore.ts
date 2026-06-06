import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from 'firebase/auth';

export interface AppUser {
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  allowedTabs?: Record<string, boolean>;
  photoURL?: string;
  tosAccepted?: boolean;
}

interface AuthState {
  firebaseUser: User | null;
  appUser: AppUser | null;
  authLoading: boolean;
  loginError: string | null;
  isDarkMode: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  language: 'en' | 'he' | 'fr' | 'de' | 'es' | 'nl' | 'is';
  autoBackupInterval: number;
  lastBackupTime: number;
  emailjsConfig?: { serviceId: string; templateId: string; publicKey: string };

  setFirebaseUser: (user: User | null) => void;
  setAppUser: (user: AppUser | null) => void;
  setAuthLoading: (val: boolean) => void;
  setLoginError: (err: string | null) => void;
  toggleDarkMode: () => void;
  setFontSize: (size: AuthState['fontSize']) => void;
  setLanguage: (lang: AuthState['language']) => void;
  setAutoBackupInterval: (hours: number) => void;
  setLastBackupTime: (time: number) => void;
  setEmailjsConfig: (config: AuthState['emailjsConfig']) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      firebaseUser: null,
      appUser: null,
      authLoading: true,
      loginError: null,
      isDarkMode: true,
      fontSize: 'medium',
      language: 'he',
      autoBackupInterval: 0,
      lastBackupTime: 0,
      emailjsConfig: undefined,

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

      setFontSize: (size) => set({ fontSize: size }),
      setLanguage: (lang) => set({ language: lang }),
      setAutoBackupInterval: (hours) => set({ autoBackupInterval: hours }),
      setLastBackupTime: (time) => set({ lastBackupTime: time }),
      setEmailjsConfig: (config) => set({ emailjsConfig: config }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        isDarkMode: s.isDarkMode,
        language: s.language,
        fontSize: s.fontSize,
        autoBackupInterval: s.autoBackupInterval,
        lastBackupTime: s.lastBackupTime,
        emailjsConfig: s.emailjsConfig,
      }),
    },
  ),
);
