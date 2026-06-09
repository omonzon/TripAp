import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TabId, TAB_DEFS } from '@/App';
import type { AppUser } from '@/store/useAuthStore';
import { useAuthStore } from '@/store/useAuthStore';

interface TabBarProps {
  tabs: typeof TAB_DEFS;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  appUser: AppUser;
}

export function TabBar({ tabs, activeTab, onTabChange, appUser }: TabBarProps) {
  const { t } = useTranslation();
  const { fontSize } = useAuthStore();
  
  const iconSizeDesktop = fontSize === 'xlarge' ? 24 : fontSize === 'large' ? 22 : 18;
  const iconSizeMobile = fontSize === 'xlarge' ? 26 : fontSize === 'large' ? 24 : 20;
  const textClassMobile = fontSize === 'xlarge' ? 'text-xs' : fontSize === 'large' ? 'text-[10px]' : 'text-[9px]';

  const visibleTabs = tabs.filter((tab) => {
    if (appUser.role === 'admin') return true;
    return appUser.allowedTabs?.[tab.id] !== false;
  });

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className="hidden md:flex flex-col w-56 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 gap-1 px-2 overflow-y-auto"
        aria-label="Main navigation"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              title={t(tab.labelKey)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 text-start w-full
                ${isActive
                  ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }
              `}
            >
              <Icon
                size={iconSizeDesktop}
                className={isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}
              />
              {t(tab.labelKey)}
              {isActive && (
                <div className="ms-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-slate-200 dark:border-slate-800 px-2 py-1 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center gap-3 md:gap-1 overflow-x-auto whitespace-nowrap hide-scrollbar px-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mob-tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                title={t(tab.labelKey)}
                className={`
                  flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[64px] flex-shrink-0
                  transition-all duration-150 rounded-xl
                  ${isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 dark:text-slate-500'
                  }
                `}
              >
                <Icon
                  size={iconSizeMobile}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  className={isActive ? 'scale-110 transition-transform' : ''}
                />
                <span className={`${textClassMobile} font-medium leading-none mt-1`}>{t(tab.labelKey)}</span>
                {isActive && <div className="w-1 h-1 rounded-full bg-brand-500 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
