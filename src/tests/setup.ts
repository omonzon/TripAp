import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  googleProvider: {},
  tripPath: (id: string) => `trips/${id}`,
  collectionPath: (id: string, col: string) => `trips/${id}/${col}`,
}));

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${opts.count} items`;
      return key;
    },
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

// Silence console.error in tests
vi.spyOn(console, 'error').mockImplementation(() => {});
