import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Moon, Sun, LogOut, WifiOff, Bell, ChevronDown, CheckCircle2, Type, Languages, X, Users } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { translateTripContent } from '@/services/translationService';
import { showToast } from '@/components/ui/Toast';
import { signOut } from '@/services/authService';
import type { TabId } from '@/App';

interface AppHeaderProps {
  showTabs?: boolean;
  activeTab?: TabId;
}

export function AppHeader({ showTabs, activeTab }: AppHeaderProps) {
  const { t } = useTranslation();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const { appUser, isDarkMode, toggleDarkMode, language, setLanguage, fontSize, setFontSize } = useAuthStore();
  const { tripProfile, currentTripId, isOnline, availableTrips, setCurrentTrip } = useTripStore();
  const [showTripsDropdown, setShowTripsDropdown] = React.useState(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  const handleLanguageToggle = async () => {
    const newLang = language === 'he' ? 'en' : 'he';
    setLanguage(newLang);
    
    if (currentTripId && appUser && (appUser.role === 'admin' || appUser.role === 'editor')) {
      if (window.confirm(t('app.translatePrompt', 'Do you want to translate your trip content to the new language?'))) {
        showToast({ type: 'success', message: t('app.translating', 'Translating...') });
        // Run in background so it doesn't block UI
        translateTripContent(currentTripId, newLang);
      }
    }
  };

  const iconSize = fontSize === 'xlarge' ? 22 : fontSize === 'large' ? 18 : 16;

  return (
    <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Logo + Trip Name */}
        <div className="flex items-center min-w-0 relative">
          <button 
            onClick={() => setShowTripsDropdown(!showTripsDropdown)}
            className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 p-1 -ms-1 rounded-lg transition-colors text-start"
            title={t('app.myTrips', 'My Trips')}
          >
            <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <ChevronDown size={16} className="text-slate-400 shrink-0 ms-1" />
          </button>

            {showTripsDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTripsDropdown(false)} />
                <div className="absolute top-full start-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-50 animate-fade-in">
                  {availableTrips.length > 0 && (
                    <div className="px-3 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {t('app.myTrips', 'My Trips')}
                    </div>
                  )}
                  {availableTrips.map(trip => (
                    <button 
                      key={trip.id}
                      className={`w-full text-start px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors ${trip.id === tripProfile?.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                      onClick={() => {
                        setCurrentTrip(trip.id);
                        setShowTripsDropdown(false);
                      }}
                    >
                      <div className={`font-bold ${trip.id === tripProfile?.id ? 'text-brand-600 dark:text-brand-400' : 'text-slate-900 dark:text-white'}`}>
                        {trip.name}
                      </div>
                      <div className="text-xs text-slate-500">{trip.destinations?.join(' · ')}</div>
                    </button>
                  ))}
                  {availableTrips.length > 0 && <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />}
                  <button 
                    className="w-full text-start px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium text-brand-600 dark:text-brand-400 transition-colors"
                    onClick={() => {
                      setCurrentTrip(null);
                      setShowTripsDropdown(false);
                    }}
                  >
                    + {t('app.createNewTrip', 'Create New Trip')}
                  </button>
                </div>
              </>
            )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Offline indicator */}
          {!isOnline && (
            <div 
              className="flex items-center gap-1 text-amber-500 text-xs font-medium px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20"
              title={t('app.offline')}
            >
              <WifiOff size={iconSize - 4} /> {t('app.offline')}
            </div>
          )}

          {/* Language toggle */}
          <button
            onClick={handleLanguageToggle}
            className="btn-ghost p-2 font-medium text-sm"
            aria-label="Toggle language"
            title={t('app.language', 'Language')}
          >
            <Languages size={iconSize} className="inline me-1" />
            {language === 'en' ? 'עב' : 'EN'}
          </button>

          {/* Font Size Toggle */}
          <button
            onClick={() => setFontSize(fontSize === 'small' ? 'medium' : fontSize === 'medium' ? 'large' : fontSize === 'large' ? 'xlarge' : 'small')}
            className="btn-ghost p-2"
            aria-label="Toggle font size"
            title={t('app.fontSize', 'Font Size')}
          >
            <Type size={iconSize} />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="btn-ghost p-2"
            aria-label="Toggle dark mode"
            title={isDarkMode ? t('app.lightMode', 'Light Mode') : t('app.darkMode', 'Dark Mode')}
          >
            {isDarkMode ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button 
              className="btn-ghost p-2 relative" 
              aria-label="Notifications"
              title={t('app.notifications', 'Notifications')}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={iconSize} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-slate-900" />
            </button>
            
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowNotifications(false)} />
                <div 
                  className="fixed top-16 left-4 right-4 sm:absolute sm:top-full sm:mt-1 sm:end-0 sm:left-auto sm:right-auto sm:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden"
                  onClick={() => setShowNotifications(false)}
                >
                <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">{t('app.notifications', 'התראות')}</h3>
                  <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title={t('app.close', 'Close')}>
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  <div className="p-2 flex gap-3 items-start hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer mb-1">
                    <div className="mt-0.5 text-brand-500"><CheckCircle2 size={iconSize} /></div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">ברוכים הבאים ל-TravelPlatform!</p>
                      <p className="text-xs text-slate-500 mt-0.5">המערכת מוכנה להתחיל לתכנן את הטיול הבא שלכם.</p>
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>

          {/* Avatar + sign out */}
          {appUser && (
            <div className="flex items-center gap-2 ms-1">
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className={`${fontSize === 'xlarge' ? 'w-8 h-8 text-sm' : 'w-7 h-7 text-xs'} rounded-full gradient-brand flex items-center justify-center text-white font-bold cursor-pointer hover:ring-2 ring-brand-300 transition-all`}
                  title={appUser.name}
                >
                  {appUser.name[0]?.toUpperCase()}
                </button>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute top-full end-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-50 animate-fade-in">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{appUser.name}</div>
                        <div className="text-xs text-slate-500 truncate" dir="ltr">{appUser.email}</div>
                      </div>
                      <button 
                        className="w-full text-start px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm flex items-center gap-2 text-slate-700 dark:text-slate-300 transition-colors"
                        onClick={async () => {
                          setShowProfileMenu(false);
                          if (window.confirm(t('app.confirmSwitch', 'האם אתה בטוח שברצונך להתנתק כדי להחליף חשבון?'))) {
                            await signOut();
                          }
                        }}
                      >
                        <Users size={16} className="text-brand-500" />
                        {t('app.switchAccount', 'החלף חשבון')}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  if (window.confirm(t('app.confirmLogout', 'האם אתה בטוח שברצונך להתנתק מהמערכת?'))) {
                    signOut();
                  }
                }}
                className="btn-ghost p-2 text-red-500 dark:text-red-400"
                aria-label={t('app.logout')}
                title={t('app.logout')}
              >
                <LogOut size={iconSize - 1} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
