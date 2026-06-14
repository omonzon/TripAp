import React from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { Globe } from 'lucide-react';

export const LANGUAGES = [
  { code: 'en', label: 'English 🇺🇸' },
  { code: 'he', label: 'עברית 🇮🇱' },
  { code: 'fr', label: 'Français 🇫🇷' },
  { code: 'de', label: 'Deutsch 🇩🇪' },
  { code: 'es', label: 'Español 🇪🇸' },
  { code: 'ru', label: 'Русский 🇷🇺' },
] as const;

export default function LanguageDropdown() {
  const { language, setLanguage } = useAuthStore();
  
  return (
    <div className="relative inline-block text-left">
      <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-shadow">
        <Globe size={16} className="text-slate-500" />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as any)}
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          dir="auto"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
