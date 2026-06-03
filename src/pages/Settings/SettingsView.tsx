import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, setDoc, updateDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import {
  Settings, Key, Cpu, Moon, Sun, Globe, DollarSign,
  Users, Eye, EyeOff, Bell, Download, Upload, CheckCircle2,
  Trash2, Plus, Loader2,
} from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore, type TaskType } from '@/store/useAIStore';
import { showToast } from '@/components/ui/Toast';
import { TAB_DEFS } from '@/App';

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'] },
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'anthropic', label: 'Anthropic Claude', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'] },
  { id: 'ollama', label: '🖥️ Ollama (Local)', models: ['gemma2', 'llama3', 'mistral', 'phi3', 'qwen2'] },
] as const;

const LANGUAGES = [
  { code: 'he', label: 'עברית 🇮🇱' },
  { code: 'en', label: 'English 🇬🇧' },
  { code: 'fr', label: 'Français 🇫🇷' },
  { code: 'de', label: 'Deutsch 🇩🇪' },
  { code: 'es', label: 'Español 🇪🇸' },
  { code: 'nl', label: 'Nederlands 🇳🇱' },
] as const;

const TASK_LABELS: Record<TaskType, string> = {
  chat: 'Chat',
  itinerary: 'Itinerary Generation',
  extraction: 'Semantic Extraction',
  vision: 'Image Analysis',
  translation: 'Translation',
};

export default function SettingsView() {
  const { t } = useTranslation();
  const { appUser, isDarkMode, toggleDarkMode, language, setLanguage } = useAuthStore();
  const { currentTripId, tripProfile } = useTripStore();
  const {
    providerType, apiKey, models, localUrl, localModelName,
    setProvider, setApiKey, setModel, setLocalConfig,
  } = useAIStore();

  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);
  const [localUrlInput, setLocalUrlInput] = useState(localUrl);
  const [localModelInput, setLocalModelInput] = useState(localModelName);
  const [saved, setSaved] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  const selectedProvider = PROVIDERS.find(p => p.id === providerType) ?? PROVIDERS[0];
  const isAdmin = appUser?.role === 'admin';

  const saveAISettings = () => {
    setApiKey(localKey);
    if (providerType === 'ollama') {
      setLocalConfig(localUrlInput, localModelInput);
    }
    setSaved(true);
    showToast({ type: 'success', message: t('settings.saved') });
    setTimeout(() => setSaved(false), 3000);
  };

  const addUser = async () => {
    if (!newUserEmail.trim() || !currentTripId) return;
    setAddingUser(true);
    try {
      await setDoc(doc(db, 'trips', currentTripId, 'users', newUserEmail.trim()), {
        email: newUserEmail.trim(),
        name: newUserEmail.trim().split('@')[0],
        role: 'viewer',
      });
      setNewUserEmail('');
      showToast({ type: 'success', message: 'User added as viewer.' });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setAddingUser(false);
    }
  };

  const exportBackup = () => {
    const data = {
      tripProfile,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ type: 'success', message: 'Backup exported!' });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Settings size={22} className="text-brand-500" />
        {t('settings.title')}
      </h2>

      {/* ── AI Provider ────────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Cpu size={18} className="text-brand-500" />
          {t('settings.aiProvider')}
        </h3>

        {/* Provider tabs */}
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              id={`provider-${p.id}`}
              onClick={() => setProvider(p.id as typeof providerType)}
              className={`py-2.5 px-3 rounded-xl text-sm font-medium text-start border-2 transition-all ${
                providerType === p.id
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* API Key (not for Ollama) */}
        {providerType !== 'ollama' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              <Key size={13} className="inline me-1" />
              {t('settings.apiKey')}
            </label>
            <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={e => setLocalKey(e.target.value)}
                placeholder="sk-... or AIza..."
                className="flex-1 py-2.5 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none font-mono"
              />
              <button onClick={() => setShowKey(s => !s)} className="text-slate-400 hover:text-slate-600 p-1">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Stored in localStorage only — never sent to Firestore</p>
          </div>
        )}

        {/* Ollama local config */}
        {providerType === 'ollama' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.localUrl')}</label>
              <input id="ollama-url" value={localUrlInput} onChange={e => setLocalUrlInput(e.target.value)} className="input-base font-mono text-sm" placeholder="http://127.0.0.1:11434/api/generate" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.localModel')}</label>
              <select id="ollama-model" value={localModelInput} onChange={e => setLocalModelInput(e.target.value)} className="input-base">
                {selectedProvider.models.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Per-task model selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('settings.modelPerTask')}</label>
          <div className="space-y-2">
            {(Object.keys(TASK_LABELS) as TaskType[]).map(task => (
              <div key={task} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-32 shrink-0">{TASK_LABELS[task]}</span>
                <select
                  id={`model-${task}`}
                  value={models[task]}
                  onChange={e => setModel(task, e.target.value)}
                  className="input-base text-sm py-1.5 flex-1"
                  disabled={providerType === 'ollama'}
                >
                  {selectedProvider.models.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <button
          id="btn-save-ai"
          onClick={saveAISettings}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {saved ? <CheckCircle2 size={16} className="text-white" /> : <Key size={16} />}
          {saved ? t('settings.saved') : t('app.save')}
        </button>
      </section>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          {isDarkMode ? <Moon size={18} className="text-brand-400" /> : <Sun size={18} className="text-amber-500" />}
          {t('settings.theme')} & {t('settings.language')}
        </h3>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-slate-300">{isDarkMode ? t('settings.dark') : t('settings.light')} mode</span>
          <button
            id="btn-toggle-dark"
            onClick={toggleDarkMode}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isDarkMode ? 'bg-brand-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${isDarkMode ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            <Globe size={13} className="inline me-1" />
            {t('settings.language')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                id={`lang-${lang.code}`}
                onClick={() => setLanguage(lang.code as typeof language)}
                className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  language === lang.code
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── User Management (Admin only) ────────────────────────────────── */}
      {isAdmin && (
        <section className="card p-5 space-y-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-brand-500" />
            {t('settings.userManagement')}
          </h3>
          <div className="flex gap-2">
            <input
              id="add-user-email"
              type="email"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              placeholder="user@email.com"
              className="input-base flex-1 text-sm"
            />
            <button
              id="btn-add-user"
              onClick={addUser}
              disabled={addingUser || !newUserEmail.trim()}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              {addingUser ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {t('settings.addUser')}
            </button>
          </div>
          <p className="text-xs text-slate-400">New users are added as viewers. Change roles in Firestore.</p>
        </section>
      )}

      {/* ── Visible Tabs ────────────────────────────────────────────────── */}
      {isAdmin && (
        <section className="card p-5 space-y-3">
          <h3 className="font-bold text-slate-800 dark:text-white">{t('settings.tabs')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {TAB_DEFS.map(tab => {
              const Icon = tab.icon;
              return (
                <div key={tab.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <Icon size={15} className="text-brand-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{tab.id}</span>
                  <CheckCircle2 size={15} className="text-green-500" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Backup & Restore ─────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Download size={18} className="text-brand-500" />
          {t('settings.backup')}
        </h3>
        <div className="flex gap-3">
          <button id="btn-export-backup" onClick={exportBackup} className="btn-secondary flex items-center gap-2 flex-1">
            <Download size={16} /> {t('settings.exportBackup')}
          </button>
          <label className="btn-secondary flex items-center gap-2 flex-1 cursor-pointer justify-center">
            <Upload size={16} /> {t('settings.importBackup')}
            <input type="file" accept=".json" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = ev => {
                try {
                  const data = JSON.parse(ev.target?.result as string);
                  showToast({ type: 'info', message: `Backup from ${data.exportedAt?.split('T')[0] ?? 'unknown date'} loaded.` });
                } catch {
                  showToast({ type: 'error', message: 'Invalid backup file.' });
                }
              };
              reader.readAsText(f);
            }} />
          </label>
        </div>
      </section>

      {/* App version */}
      <p className="text-xs text-center text-slate-400 dark:text-slate-600 pb-2">
        TravelPlatform v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'} · {import.meta.env.VITE_FIREBASE_PROJECT_ID}
      </p>
    </div>
  );
}
