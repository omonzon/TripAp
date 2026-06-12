import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Sparkles, Shield, Moon, Sun, Languages, Type } from 'lucide-react';
import { signInWithGoogle, signInWithTestAccount } from '@/services/authService';
import { useAuthStore } from '@/store/useAuthStore';

export function AuthScreen() {
  const { t, i18n } = useTranslation();
  const { authLoading, loginError, isDarkMode, toggleDarkMode, language, setLanguage, fontSize, setFontSize } = useAuthStore();

  const features = [
    { icon: '🗺️', title: t('auth.features.itinerary.title'), desc: t('auth.features.itinerary.desc') },
    { icon: '📍', title: t('auth.features.tracking.title'), desc: t('auth.features.tracking.desc') },
    { icon: '💸', title: t('auth.features.expenses.title'), desc: t('auth.features.expenses.desc') },
    { icon: '✈️', title: t('auth.features.offline.title'), desc: t('auth.features.offline.desc') },
  ];

  return (
    <div className="min-h-screen bg-[url('/auth-bg.png')] bg-cover bg-center flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-[2px]" />

      {/* Top right controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-20" dir="ltr">
        <button
          onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
          className="btn-ghost text-white hover:bg-white/20 p-2"
          title={language === 'he' ? 'English' : 'עברית'}
        >
          <Languages size={18} />
        </button>
        <button
          onClick={() => setFontSize(fontSize === 'small' ? 'medium' : fontSize === 'medium' ? 'large' : 'small')}
          className="btn-ghost text-white hover:bg-white/20 p-2"
          title={t('app.fontSize', 'Font Size')}
        >
          <Type size={18} />
        </button>
        <button
          onClick={toggleDarkMode}
          className="btn-ghost text-white hover:bg-white/20 p-2"
          title={isDarkMode ? t('app.lightMode') : t('app.darkMode')}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {import.meta.env.DEV && (
          <button
            id="e2e-test-login"
            className="opacity-0 absolute w-0 h-0"
            onClick={signInWithTestAccount}
            aria-hidden="true"
          >
            Test Login
          </button>
        )}
      </div>

      {/* Hero */}
      <div className="text-center mb-8 animate-fade-in relative z-10">
        <div className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl animate-pulse-glow overflow-hidden bg-white/10 backdrop-blur-md border border-white/20">
          <img src="/logo.png" alt="TripAp Logo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight drop-shadow-xl">
          TripAp
        </h1>
        <p className="text-slate-100 text-lg md:text-xl max-w-md mx-auto drop-shadow-md leading-relaxed">
          {t('auth.subtitle')}
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-3 mb-10 max-w-md w-full animate-slide-up relative z-10" dir="ltr">
        {features.map((f, i) => (
          <div
            key={i}
            className="glass rounded-2xl p-4 text-white hover:scale-105 transition-transform backdrop-blur-md bg-white/10 dark:bg-black/20 border border-white/20 shadow-lg"
            dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
          >
            <div className="text-3xl mb-2 drop-shadow-md">{f.icon}</div>
            <h3 className="font-bold text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-slate-200 leading-snug">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Sign in card */}
      <div className="glass rounded-3xl p-8 max-w-sm w-full animate-slide-up text-center relative z-10 backdrop-blur-xl bg-white/10 dark:bg-black/30 border border-white/20 shadow-2xl">
        <div className="flex flex-col items-center justify-center gap-1 mb-2 text-white">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-brand-300" />
            <span className="text-sm text-brand-200">Secured by Google Firebase</span>
          </div>
          <p className="text-[10px] text-slate-300 px-2 leading-tight">
            {t('auth.secureNote', 'All data is encrypted and securely transmitted via HTTPS to Google Firebase.')}
          </p>
        </div>
        <Sparkles className="w-8 h-8 text-brand-300 mx-auto mb-4" />
        <h2 className="text-white font-bold text-xl mb-2">{t('auth.title')}</h2>
        <p className="text-brand-200 text-sm mb-6">{t('auth.subtitle')}</p>

        {loginError && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm p-3 rounded-xl mb-4">
            {loginError}
          </div>
        )}

        <button
          id="btn-google-signin"
          onClick={signInWithGoogle}
          disabled={authLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold py-3 px-6 rounded-xl transition-all duration-150 shadow-lg hover:shadow-xl disabled:opacity-60"
        >
          {authLoading ? (
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {authLoading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </div>
    </div>
  );
}
