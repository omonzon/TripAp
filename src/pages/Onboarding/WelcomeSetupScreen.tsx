import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Key, Info, AlertTriangle } from 'lucide-react';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { fetchGeminiModels, fetchOpenAIModels, fetchAnthropicModels, validateAIConnection, type AIProvider } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';

export default function WelcomeSetupScreen() {
  const { t } = useTranslation();
  const { appUser, setAppUser, setAiSetupDismissed } = useAuthStore();
  const { currentTripId } = useTripStore();
  const { providerType, setProvider, setApiKey, setAllGeminiModels } = useAIStore();
  
  const isEditorOrAdmin = appUser?.role === 'admin' || appUser?.role === 'editor';
  const needsApiKey = isEditorOrAdmin && !useAIStore.getState().apiKey;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(appUser?.name || '');
  const [age, setAge] = useState('');
  const [personalPreferences, setPersonalPreferences] = useState('');
  const [tempProvider, setTempProvider] = useState<AIProvider['type']>(providerType || 'gemini');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [downgradePrompt, setDowngradePrompt] = useState<{
    isOpen: boolean;
    errorMsg: string;
    fallbackModel: string;
  } | null>(null);

  const handleValidateKey = async () => {
    if (!tempApiKey.trim() && tempProvider !== 'ollama') return;
    setIsValidating(true);
    setKeyError(null);
    setKeySuccess(false);
    try {
      if (tempProvider === 'gemini') {
        const models = await fetchGeminiModels(tempApiKey.trim());
        setAvailableModels(models);
        let defaultModel = models.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : models[0];
        setSelectedModel(defaultModel);
      } else if (tempProvider === 'openai') {
        let models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
        try {
          const dynamicModels = await fetchOpenAIModels(tempApiKey.trim());
          if (dynamicModels.length > 0) models = dynamicModels;
        } catch(e) { console.warn("Failed to fetch OpenAI models, using fallback", e); }
        setAvailableModels(models);
        setSelectedModel(models.includes('gpt-4o') ? 'gpt-4o' : models[0]);
      } else if (tempProvider === 'anthropic') {
        let models = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'];
        try {
          const dynamicModels = await fetchAnthropicModels(tempApiKey.trim());
          if (dynamicModels.length > 0) models = dynamicModels;
        } catch(e) { console.warn("Failed to fetch Anthropic models, using fallback", e); }
        setAvailableModels(models);
        setSelectedModel(models.includes('claude-3-5-sonnet-20240620') ? 'claude-3-5-sonnet-20240620' : models[0]);
      } else if (tempProvider === 'ollama') {
        setAvailableModels(['llama3', 'gemma2']);
        setSelectedModel('gemma2');
      }
      
      let modelToTest = selectedModel || (tempProvider === 'gemini' && availableModels.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : availableModels[0]) || 'gemini-1.5-flash';
      let isConnectionValid = false;

      try {
        isConnectionValid = await validateAIConnection(tempProvider, tempApiKey.trim(), modelToTest);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const isQuotaError = errMsg.includes('GeminiOverloadError') || errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('Too Many Requests') || errMsg.includes('RESOURCE_EXHAUSTED');
        
        if (tempProvider === 'gemini' && !modelToTest.includes('flash')) {
          let fallbackModel = (availableModels.length > 0 && availableModels.includes('gemini-2.5-flash')) ? 'gemini-2.5-flash' : 'gemini-1.5-flash';
          
          if (fallbackModel) {
            setSelectedModel(fallbackModel);
            setDowngradePrompt({
              isOpen: true,
              errorMsg: errMsg,
              fallbackModel: fallbackModel
            });
            // Stop validating, let user decide via modal
            setIsValidating(false);
            return;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      
      if (!isConnectionValid) {
        throw new Error('AI Test Failed');
      }
      
      setKeySuccess(true);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('GeminiOverloadError') || errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('Too Many Requests') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        setKeyError(`שגיאת מכסה (Quota/Rate Limit): החשבון הגיע למגבלה. באפשרותך לנסות מודל חלופי או להוסיף אמצעי תשלום למפתח שלך.`);
      } else {
        setKeyError(t('onboarding.keyInvalid', 'המפתח אינו חוקי או שחיבור ה-AI נכשל. אנא ודא שהעתקת אותו נכון.'));
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleValidateAndSave = async (skipAI: boolean = false) => {
    setIsSaving(true);
    try {
      // 1. Update user's name
      let newName = name.trim();
      if (newName !== appUser?.name) {
        newName = newName || appUser?.email.split('@')[0] || 'User';
        if (appUser?.email) {
          await updateDoc(doc(db, 'users', appUser.email), { name: newName });
          setAppUser({ ...appUser, name: newName });
        }
      }

      // 1.5 Update trip preferences
      if (currentTripId && (age.trim() || personalPreferences.trim())) {
        const tripRef = doc(db, 'trips', currentTripId, 'profile', 'main');
        const tripSnap = await getDoc(tripRef);
        if (tripSnap.exists()) {
          const existingPrefs = tripSnap.data().preferences || '';
          let appendedPrefs = `\\n- Participant: ${newName}`;
          if (age.trim()) appendedPrefs += ` (Age ${age.trim()})`;
          if (personalPreferences.trim()) appendedPrefs += ` - Preferences: ${personalPreferences.trim()}`;
          
          await updateDoc(tripRef, {
            preferences: (existingPrefs + appendedPrefs).trim()
          });
        }
      }

      // 2. Handle API Key
      if (!skipAI && needsApiKey && (tempApiKey.trim() || tempProvider === 'ollama')) {
        setIsValidating(true);
        if (tempProvider === 'gemini') {
          try {
            const isConnectionValid = await validateAIConnection(tempProvider, tempApiKey.trim(), selectedModel);
            if (!isConnectionValid) throw new Error('Test Failed');
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (tempProvider === 'gemini' && !selectedModel.includes('flash')) {
              let fallbackModel = (availableModels.length > 0 && availableModels.includes('gemini-2.5-flash')) ? 'gemini-2.5-flash' : 'gemini-1.5-flash';
              if (fallbackModel) {
                setSelectedModel(fallbackModel);
                setDowngradePrompt({
                  isOpen: true,
                  errorMsg: errMsg,
                  fallbackModel: fallbackModel
                });
                setIsValidating(false);
                setIsSaving(false);
                return;
              }
            }
            showToast({ type: 'error', message: `שגיאת רשת בבדיקת המודל ${selectedModel}.` });
            setIsValidating(false);
            setIsSaving(false);
            return;
          }
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  גיל (אופציונלי)
                </label>
                <input
                  type="number"
                  className="input-base"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="גיל (למשל 30, 4.5)"
                  dir="auto"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  העדפות אישיות (אופציונלי)
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={personalPreferences}
                  onChange={(e) => setPersonalPreferences(e.target.value)}
                  placeholder="אלרגיות, נגישות, סגנון..."
                  dir="auto"
                />
              </div>
            </div>
            
            <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
              <Info size={14} className="shrink-0 mt-0.5" />
              הפרטים האישיים יתווספו להעדפות הטיול הכלליות כך שה-AI יוכל להתחשב בהם בתכנון (העדפות מזון, נגישות וכדומה).
            </p>

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
                  setKeySuccess(false);
                  setAvailableModels([]);
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
                      setKeySuccess(false);
                      setAvailableModels([]);
                    }} 
                    placeholder={tempProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'} 
                    dir="ltr"
                  />
                  {tempApiKey.trim() && !keySuccess && !isValidating && (
                    <button 
                      onClick={handleValidateKey}
                      className="absolute inset-y-1.5 right-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md transition-colors"
                    >
                      אמת מפתח
                    </button>
                  )}
                  {isValidating && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <Loader2 size={16} className="animate-spin text-brand-500" />
                    </div>
                  )}
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

            <div className="mb-2">
              {keyError && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1 animate-fade-in">
                  <AlertTriangle size={12} />
                  {keyError}
                </p>
              )}
              {keySuccess && (
                <p className="text-xs text-green-500 mt-2 flex items-center gap-1 animate-fade-in">
                  <Sparkles size={12} />
                  המפתח אומת בהצלחה!
                </p>
              )}
            </div>

            {availableModels.length > 0 && (
              <div className="mt-4 animate-fade-in">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  בחר מודל
                </label>
                <p className="text-xs text-brand-600 dark:text-brand-400 font-medium mb-2">
                  ✨ שימוש במודלים מתקדמים (כמו מודל ה-Pro) יניב תוצאות טובות בהרבה בתכנון המסלול, אך לרוב דורש הגדרת אמצעי תשלום (Billing) בחשבון גוגל.
                </p>
                <select className="input-base" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
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
                disabled={(!keySuccess && tempProvider !== 'ollama') || isSaving || isValidating}
              >
                {(isSaving || isValidating) ? <Loader2 size={16} className="animate-spin" /> : 'שמור והיכנס לטיול'}
              </button>
            </div>
          </div>
        )}
      </div>

      {downgradePrompt?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6 text-center animate-fade-in shadow-xl border border-brand-200 dark:border-brand-800">
            <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">בעיה במודל הנבחר</h3>
            <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm leading-relaxed">
              זיהינו שגיאה בשימוש במודל המתקדם: <br/><span className="text-red-500 font-mono text-xs">{downgradePrompt.errorMsg}</span><br/><br/>
              כדי שתוכל להמשיך, עברנו אוטומטית להשתמש במודל חינמי מהיר (<strong>{downgradePrompt.fallbackModel}</strong>).
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  setDowngradePrompt(null);
                  handleValidateKey();
                }}
                className="btn-primary w-full py-3"
              >
                אישור אימות מחדש עם המודל החינמי
              </button>
              <button 
                onClick={() => {
                  setDowngradePrompt(null);
                }}
                className="btn-secondary w-full py-3"
              >
                בטל וחזור להגדרות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
