import React, { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Map, CheckSquare, MessageCircle, Receipt, Navigation,
  Languages, Sparkles, Settings, Loader2, WifiOff, Globe
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppHeader } from '@/components/layout/AppHeader';
import { TabBar } from '@/components/layout/TabBar';
import { Toast } from '@/components/ui/Toast';
import { createFullBackup } from '@/services/backupService';
import '@/i18n';

// Lazy-load all heavy tab views
const ItineraryView   = lazy(() => import('@/pages/Itinerary/ItineraryView'));
const TasksView       = lazy(() => import('@/pages/Tasks/TasksView'));
const GroupChatView   = lazy(() => import('@/pages/GroupChat/GroupChatView'));
const ExpensesView    = lazy(() => import('@/pages/Expenses/ExpensesView'));
const LocationView    = lazy(() => import('@/pages/Locations/LocationView'));
const TranslationView = lazy(() => import('@/pages/Translate/TranslationView'));
const AIAssistantView = lazy(() => import('@/pages/AIAssistant/AIAssistantView'));
const SettingsView    = lazy(() => import('@/pages/Settings/SettingsView'));
const OnboardingView  = lazy(() => import('@/pages/Onboarding/OnboardingView'));

export const TAB_DEFS = [
  { id: 'itinerary',  icon: Map,            labelKey: 'tabs.itinerary',  component: ItineraryView },
  { id: 'tasks',      icon: CheckSquare,    labelKey: 'tabs.tasks',      component: TasksView },
  { id: 'groupchat',  icon: MessageCircle,  labelKey: 'tabs.groupchat',  component: GroupChatView },
  { id: 'expenses',   icon: Receipt,        labelKey: 'tabs.expenses',   component: ExpensesView },
  { id: 'locations',  icon: Navigation,     labelKey: 'tabs.locations',  component: LocationView },
  { id: 'translate',  icon: Languages,      labelKey: 'tabs.translate',  component: TranslationView },
  { id: 'ai',         icon: Sparkles,       labelKey: 'tabs.ai',         component: AIAssistantView },
  { id: 'settings',   icon: Settings,       labelKey: 'tabs.settings',   component: SettingsView },
] as const;

export type TabId = typeof TAB_DEFS[number]['id'];

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { firebaseUser, appUser, authLoading, isDarkMode, language, autoBackupInterval, lastBackupTime, setLastBackupTime } = useAuthStore();
  const { currentTripId, isOnline, setOnline } = useTripStore();
  const [activeTab, setActiveTab] = React.useState<TabId>('itinerary');

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // Apply language + RTL
  useEffect(() => {
    i18n.changeLanguage(language);
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, i18n]);

  // Online/offline detection
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [setOnline]);

  // Auto Backup worker
  useEffect(() => {
    if (!currentTripId || !appUser?.email || autoBackupInterval === 0 || !isOnline) return;

    const checkAndBackup = async () => {
      const now = Date.now();
      const intervalMs = autoBackupInterval * 60 * 60 * 1000;
      if (now - lastBackupTime >= intervalMs) {
        await createFullBackup(currentTripId, appUser.email);
        setLastBackupTime(now);
      }
    };

    checkAndBackup();
    const timer = setInterval(checkAndBackup, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [currentTripId, appUser?.email, autoBackupInterval, lastBackupTime, isOnline, setLastBackupTime]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen gradient-hero">
        <div className="text-center text-white">
          <Globe className="w-16 h-16 mx-auto mb-4 animate-pulse text-brand-300" />
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="text-brand-200 mt-2">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !appUser) {
    return <AuthScreen />;
  }

  // If no trip created, show onboarding
  if (!currentTripId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <AppHeader showTabs={false} />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Suspense fallback={<PageLoader />}>
            <OnboardingView />
          </Suspense>
        </main>
      </div>
    );
  }

  const ActiveComponent = TAB_DEFS.find(t => t.id === activeTab)?.component ?? ItineraryView;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <AppHeader showTabs activeTab={activeTab} />

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center gap-2 justify-center sticky top-0 z-40">
          <WifiOff size={14} />
          {t('app.offline')} — {t('errors.networkError')}
        </div>
      )}

      {/* Tab bar (desktop sidebar + mobile bottom) */}
      <div className="flex flex-1 overflow-hidden">
        <TabBar
          tabs={TAB_DEFS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          appUser={appUser}
        />

        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 md:px-6 pb-24 md:pb-6"
          dir={language === 'he' ? 'rtl' : 'ltr'}
        >
          <Suspense fallback={<PageLoader />}>
            <ActiveComponent />
          </Suspense>
        </main>
      </div>

      <Toast />
    </div>
  );
}
