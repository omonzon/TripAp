import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Key, Info, AlertTriangle } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useAIStore } from '@/store/useAIStore';
import { fetchGeminiModels, fetchOpenAIModels, fetchAnthropicModels, type AIProvider } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';

export default function WelcomeSetupScreen() {
  const { t } = useTranslation();
  const { appUser, setAppUser, setAiSetupDismissed } = useAuthStore();
  const { providerType, setProvider, setApiKey, setAllGeminiModels } = useAIStore();
  
  const isEditorOrAdmin = appUser?.role === 'admin' || appUser?.role === 'editor';
  const needsApiKey = isEditorOrAdmin && !useAIStore.getState().apiKey;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(appUser?.name || '');
  const [tempProvider, setTempProvider] = useState<AIProvider['type']>(providerType || 'gemini');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleValidateAndSave = async (skipAI: boolean = false) => {
    setIsSaving(true);
    try {
      // 1. Update user's name
      if (name.trim() !== appUser?.name) {
        const newName = name.trim() || appUser?.email.split('@')[0] || 'User';
        if (appUser?.email) {
          await updateDoc(doc(db, 'users', appUser.email), { name: newName });
          setAppUser({ ...appUser, name: newName });
        }
      }

      // 2. Handle API Key
      if (!skipAI && needsApiKey && tempApiKey.trim() && tempProvider !== 'ollama') {
        setIsValidating(true);
        setKeyError(null);
        try {
          let selectedModel = '';
          if (tempProvider === 'gemini') {
            const models = await fetchGeminiModels(tempApiKey.trim());
            selectedModel = models.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : models[0];
          } else if (tempProvider === 'openai') {
            selectedModel = 'gpt-4o';
          } else if (tempProvider === 'anthropic') {
            selectedModel = 'claude-3-5-sonnet-20240620';
          }
          
          setProvider(tempProvider);
          setApiKey(tempApiKey.trim());
          if (selectedModel) setAllGeminiModels(selectedModel);

          // Save AI settings
          if (appUser?.email) {
            await setDoc(doc(db, 'users', appUser.email, 'settings', 'app'), {
              aiSettings: {
                providerType: tempProvider,
                apiKey: tempApiKey.trim(),
                models: useAIStore.getState().models
              }
            }, { merge: true });
          }
        } catch (err) {
          setKeyError(t('onboarding.keyInvalid', 'המפתח אינו חוקי. אנא ודא שהעתקת אותו נכון.'));
          setIsValidating(false);
          setIsSaving(false);
          return;
        }
        setIsValidating(false);
      }

      // 3. Mark setup as completed
      if (appUser?.email) {
        await setDoc(doc(db, 'users', appUser.email, 'settings', 'app'), {
          aiSetupDismissed: true
        }, { merge: true });
      }
      setAiSetupDismissed(true);
      showToast({ type: 'success', message: 'ברוכים הבאים לטיול!' });

    } catch (err: any) {
      console.error('Setup failed', err);
      showToast({ type: 'error', message: err.message || 'Failed to save setup' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-4 animate-fade-in">
      <div className="text-center mb-8">
        <img src="/logo.png" alt="TripAp Logo" className="w-20 h-20 mx-auto mb-4 object-contain drop-shadow-xl" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ברוכים הבאים לטיול! 👋</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">רגע לפני שמתחילים, נשלים כמה פרטים קטנים.</p>
      </div>

      <div className="card p-6 md:p-8">
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                איך תרצו שנקרא לכם?
              </label>
              <input
                type="text"
                className="input-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="השם שלך"
                dir="auto"
              />
            </div>

            <button
              onClick={() => needsApiKey ? setStep(2) : handleValidateAndSave(true)}
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              המשך
            </button>
          </div>
        )}

        {step === 2 && needsApiKey && (
          <div className="space-y-6 animate-fade-in">
            <button onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm mb-4">
              <ArrowLeft size={16} /> חזור
            </button>
            
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex justify-center items-center gap-2">
                <Sparkles className="text-brand-500" />
                הגדרת בינה מלאכותית
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm">
                בתור עורך בטיול, תוכל להשתמש ב-AI כדי להפיק מסלולים ומשימות.
              </p>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                ספק AI
              </label>
              <select 
                className="input-base cursor-pointer"
                value={tempProvider}
                onChange={(e) => {
                  setTempProvider(e.target.value as AIProvider['type']);
                  setKeyError(null);
                }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>

            {tempProvider !== 'ollama' && (
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  מפתח API
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key size={16} className="text-slate-400" />
                  </div>
                  <input 
                    type="password" 
                    className="input-base pl-10 text-left" 
                    value={tempApiKey} 
                    onChange={(e) => {
                      setTempApiKey(e.target.value);
                      setKeyError(null);
                    }} 
                    placeholder={tempProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'} 
                    dir="ltr"
                  />
                </div>
                
                {tempProvider === 'gemini' && (
                  <p className="text-xs text-slate-500 mt-2 flex items-start gap-1">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    ניתן להשיג מפתח בחינם ב-
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-semibold">
                      Google AI Studio
                    </a>
                  </p>
                )}
              </div>
            )}

            {keyError && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1 animate-fade-in">
                <AlertTriangle size={12} />
                {keyError}
              </p>
            )}

            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => handleValidateAndSave(true)}
                className="btn-secondary flex-1"
                disabled={isSaving || isValidating}
              >
                דלג לעת עתה
              </button>
              <button
                onClick={() => handleValidateAndSave(false)}
                className="btn-primary flex-1 flex justify-center items-center gap-2"
                disabled={!tempApiKey.trim() || isSaving || isValidating}
              >
                {(isSaving || isValidating) ? <Loader2 size={16} className="animate-spin" /> : 'שמור והיכנס לטיול'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
