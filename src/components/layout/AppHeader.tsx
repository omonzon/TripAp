import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Moon, Sun, LogOut, WifiOff, Bell } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { signOut } from '@/services/authService';
import type { TabId } from '@/App';

interface AppHeaderProps {
  showTabs?: boolean;
  activeTab?: TabId;
}

export function AppHeader({ showTabs = true }: AppHeaderProps) {
  const { t } = useTranslation();
  const { appUser, isDarkMode, toggleDarkMode, language, setLanguage } = useAuthStore();
  const { tripProfile, isOnline } = useTripStore();

  return (
    <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Logo + Trip Name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-none text-slate-900 dark:text-white truncate">
              {tripProfile?.name ?? t('app.name')}
            </h1>
            {tripProfile && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {tripProfile.destinations.join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Offline indicator */}
          {!isOnline && (
            <div className="flex items-center gap-1 text-amber-500 text-xs font-medium px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <WifiOff size={12} /> {t('app.offline')}
            </div>
          )}

          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
            className="btn-ghost p-2 text-xs font-bold"
            aria-label="Toggle language"
            title={language === 'en' ? 'עברית' : 'English'}
          >
            {language === 'en' ? 'עב' : 'EN'}
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="btn-ghost p-2"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notifications placeholder */}
          <button className="btn-ghost p-2" aria-label="Notifications">
            <Bell size={16} />
          </button>

          {/* Avatar + sign out */}
          {appUser && (
            <div className="flex items-center gap-2 ms-1">
              <div
                className="w-7 h-7 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold cursor-pointer"
                title={appUser.name}
              >
                {appUser.name[0]?.toUpperCase()}
              </div>
              <button
                onClick={signOut}
                className="btn-ghost p-2 text-red-500 dark:text-red-400"
                aria-label={t('app.logout')}
                title={t('app.logout')}
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
