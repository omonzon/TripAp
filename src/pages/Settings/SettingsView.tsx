import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, setDoc, updateDoc, collection, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import {
  Settings, Key, Cpu, Moon, Sun, Globe, DollarSign,
  Users, Eye, EyeOff, Bell, Download, Upload, CheckCircle2,
  Trash2, Plus, Loader2, Camera,
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
  const { appUser, isDarkMode, toggleDarkMode, language, setLanguage, autoBackupInterval, setAutoBackupInterval } = useAuthStore();
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
  const [newUserRole, setNewUserRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [newAlbumUrl, setNewAlbumUrl] = useState('');

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
        role: newUserRole,
      });
      if (tripProfile) {
        await setDoc(doc(db, 'users', newUserEmail.trim()), {
          trips: arrayUnion({ id: currentTripId, name: tripProfile.name, destinations: tripProfile.destinations })
        }, { merge: true });
      }
      setNewUserEmail('');
      showToast({ type: 'success', message: t('settings.userAdded') });
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
    showToast({ type: 'success', message: t('settings.backupExported') });
  };

  const deleteCurrentTrip = async () => {
    if (!currentTripId || !tripProfile) return;
    if (!window.confirm(t('settings.confirmDeleteTrip', 'Are you sure you want to delete this trip? This action cannot be undone.'))) return;
    try {
      await deleteDoc(doc(db, 'trips', currentTripId, 'profile', 'main'));
      useTripStore.getState().setCurrentTrip(null);
      showToast({ type: 'success', message: t('settings.tripDeleted', 'Trip deleted successfully') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const addAlbumUrl = async () => {
    if (!newAlbumUrl.trim() || !currentTripId) return;
    try {
      const albums = tripProfile?.photoAlbums || [];
      await updateDoc(doc(db, 'trips', currentTripId, 'profile', 'main'), {
        photoAlbums: [...albums, newAlbumUrl.trim()]
      });
      setNewAlbumUrl('');
      showToast({ type: 'success', message: t('settings.albumAdded', 'Album added!') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const removeAlbumUrl = async (url: string) => {
    if (!currentTripId) return;
    try {
      const albums = (tripProfile?.photoAlbums || []).filter(u => u !== url);
      await updateDoc(doc(db, 'trips', currentTripId, 'profile', 'main'), {
        photoAlbums: albums
      });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
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
            <p className="text-xs text-slate-400 mt-1">{t('settings.apiKeyHelp')}</p>
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
            <select
              value={newUserRole}
              onChange={e => setNewUserRole(e.target.value as any)}
              className="input-base text-sm w-28 shrink-0"
            >
              <option value="viewer">{t('settings.roleViewer', 'Viewer')}</option>
              <option value="editor">{t('settings.roleEditor', 'Editor')}</option>
              <option value="admin">{t('settings.roleAdmin', 'Admin')}</option>
            </select>
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
          <p className="text-xs text-slate-400">{t('settings.addUserHelp')}</p>
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
        <div className="flex gap-3 mt-4">
          <button id="btn-export-backup" onClick={exportBackup} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
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
                  showToast({ type: 'info', message: t('settings.backupLoaded', { date: data.exportedAt?.split('T')[0] ?? 'unknown date' }) });
                } catch {
                  showToast({ type: 'error', message: t('settings.backupError') });
                }
              };
              reader.readAsText(f);
            }} />
          </label>
        </div>
        
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.autoBackup', 'Auto Backup Interval')}</label>
            <p className="text-xs text-slate-400">{t('settings.autoBackupHelp', 'Backups are stored safely in cloud storage')}</p>
          </div>
          <select 
            value={autoBackupInterval.toString()}
            onChange={e => setAutoBackupInterval(parseInt(e.target.value, 10))}
            className="input-base text-sm py-1.5 w-32"
          >
            <option value="0">{t('settings.disabled', 'Disabled')}</option>
            <option value="6">6 {t('settings.hours', 'Hours')}</option>
            <option value="12">12 {t('settings.hours', 'Hours')}</option>
            <option value="24">24 {t('settings.hours', 'Hours')}</option>
          </select>
        </div>
      </section>

      {/* ── Trip Albums ─────────────────────────────────────────────────── */}
      {currentTripId && tripProfile && (
        <section className="card p-5 space-y-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Camera size={18} className="text-brand-500" />
            {t('settings.photoAlbums', 'Photo Albums (Links)')}
          </h3>
          <div className="flex gap-2">
            <input
              type="url"
              value={newAlbumUrl}
              onChange={e => setNewAlbumUrl(e.target.value)}
              placeholder="https://photos.app.goo.gl/..."
              className="input-base flex-1 text-sm"
              dir="ltr"
            />
            <button
              onClick={addAlbumUrl}
              disabled={!newAlbumUrl.trim()}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              <Plus size={16} />
              {t('app.add', 'Add')}
            </button>
          </div>
          
          <div className="space-y-2 mt-2">
            {(tripProfile.photoAlbums || []).map((url, i) => (
              <div key={i} className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                <a href={url} target="_blank" rel="noreferrer" className="text-sm text-brand-600 dark:text-brand-400 hover:underline truncate mr-2" dir="ltr">{url}</a>
                <button onClick={() => removeAlbumUrl(url)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!(tripProfile.photoAlbums?.length) && (
              <p className="text-xs text-slate-400">{t('settings.noAlbums', 'No photo albums added yet.')}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      {isAdmin && currentTripId && (
        <section className="card p-5 space-y-4 border border-red-100 dark:border-red-900/30">
          <h3 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
            <Trash2 size={18} />
            {t('settings.dangerZone', 'Danger Zone')}
          </h3>
          <button onClick={deleteCurrentTrip} className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2">
            <Trash2 size={16} />
            {t('settings.deleteTrip', 'Delete Current Trip')}
          </button>
        </section>
      )}

      {/* App version */}
      <p className="text-xs text-center text-slate-400 dark:text-slate-600 pb-2">
        TravelPlatform v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'} · {import.meta.env.VITE_FIREBASE_PROJECT_ID}
      </p>
    </div>
  );
}
