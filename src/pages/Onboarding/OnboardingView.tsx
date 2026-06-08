import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Globe, Key, FileText, Info, Camera } from 'lucide-react';
import { doc, setDoc, arrayUnion, deleteDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, type TripProfile } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { extractSemanticGraph, extractSemanticGraphFromFile, getConstraints } from '@/engine/semanticEngine';
import { generateComprehensiveTrip } from '@/engine/comprehensiveGenerator';
import { fetchGeminiModels, fetchOpenAIModels, fetchAnthropicModels, type AIProvider } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { restoreTripFromFile } from '@/services/backupService';
import { UploadCloud } from 'lucide-react';
import { compressImageToBase64 } from '@/utils/imageCompressor';
import TermsOfServiceModal from '@/components/TermsOfServiceModal';

const STEPS = 6;

export default function OnboardingView() {
  const { t, i18n } = useTranslation();
  const { appUser } = useAuthStore();
  const { setCurrentTrip, setTripProfile } = useTripStore();
  const { getProviderForTask, updateTripGraph, setExtracting, isExtracting, apiKey, setApiKey, setAllGeminiModels, setProvider, isApiKeyInvalid, setApiKeyInvalid } = useAIStore();

  const [step, setStep] = useState(useAIStore.getState().apiKey ? 3 : 1);
  const [tempProvider, setTempProvider] = useState<AIProvider['type']>(useAIStore.getState().providerType);
  const [skipAI, setSkipAI] = useState(false);
  const [showTos, setShowTos] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-pro');
  const [tempApiKey, setTempApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const [form, setForm] = useState({
    name: '',
    destinations: '',
    startDate: '',
    endDate: '',
    budget: '',
    currency: 'USD',
    pace: 'moderate' as TripProfile['pace'],
    preferences: '',
    bookings: '',
    tripStyle: [] as string[],
  });
  const [constraintCount, setConstraintCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [restoring, setRestoring] = useState(false);
  const [addedSegments, setAddedSegments] = useState<{ id: string, type: 'text' | 'file', title: string, constraintsFound: number }[]>([]);
  const [currentSegmentText, setCurrentSegmentText] = useState('');
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [generatedTripId, setGeneratedTripId] = useState<string | null>(null);

  const loadingPhrases = [
    t('onboarding.loadingPhrase1', 'קורא מסמכים ותוהה למה אנשים מדפיסים כרטיסי טיסה...'),
    t('onboarding.loadingPhrase2', 'מכין מסלול מדהים (ומקווה שלא תלכו לאיבוד)...'),
    t('onboarding.loadingPhrase3', 'משלב את כל ההעדפות שלכם, גם את המוזרות שבהן...'),
    t('onboarding.loadingPhrase4', 'אורז את המשימות לרשימה מסודרת...'),
    t('onboarding.loadingPhrase5', 'מחפש איפה הכי זול לאכול פיצה...'),
    t('onboarding.loadingPhrase6', 'מתמקח עם נהגי מוניות וירטואליים...'),
    t('onboarding.loadingPhrase7', 'זה לוקח קצת זמן כי הטיול הזה פשוט גדול עלינו! סתם, עוד רגע מסיימים...')
  ];

  React.useEffect(() => {
    if (isApiKeyInvalid) {
      setStep(1);
      setGenerating(false);
      setApiKeyInvalid(false);
    }
  }, [isApiKeyInvalid, setApiKeyInvalid]);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (generating) {
      interval = setInterval(() => {
        setLoadingPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
      }, 4500);
    } else {
      setLoadingPhraseIndex(0);
    }
    return () => clearInterval(interval);
  }, [generating, loadingPhrases.length]);

  const next = () => {
    let nextStep = step + 1;
    if (nextStep === 2) nextStep = 3; // Skip Step 2 (Admin User display)
    // If skipAI is true, jump from Step 3 (Trip Details) to Step 6 (Review)
    if (skipAI && nextStep === 4) {
      nextStep = 6;
    }
    setStep(Math.min(nextStep, STEPS));
  };
  
  const back = () => {
    let prevStep = step - 1;
    if (prevStep === 2) prevStep = 1; // Skip Step 2
    // If skipAI is true, jump back from Step 6 (Review) to Step 3 (Trip Details)
    if (skipAI && prevStep === 5) {
      prevStep = 3;
    }
    setStep(Math.max(prevStep, 1));
  };

  const handleValidateKey = async () => {
    if (!tempApiKey.trim() && tempProvider !== 'ollama') return;
    setIsValidating(true);
    setKeyError(null);
    setKeySuccess(false);
    try {
      if (tempProvider === 'gemini') {
        const models = await fetchGeminiModels(tempApiKey.trim());
        setAvailableModels(models);
        if (models.includes('gemini-2.5-pro')) setSelectedModel('gemini-2.5-pro');
        else if (models.includes('gemini-1.5-pro')) setSelectedModel('gemini-1.5-pro');
        else if (models.includes('gemini-1.5-flash')) setSelectedModel('gemini-1.5-flash');
        else if (models.length > 0) setSelectedModel(models[0]);
      } else if (tempProvider === 'openai') {
        let models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
        try {
          const dynamicModels = await fetchOpenAIModels(tempApiKey.trim());
          if (dynamicModels.length > 0) models = dynamicModels;
        } catch(e) { console.warn("Failed to fetch OpenAI models, using fallback", e); }
        setAvailableModels(models);
        if (models.includes('gpt-4o')) setSelectedModel('gpt-4o');
        else setSelectedModel(models[0]);
      } else if (tempProvider === 'anthropic') {
        let models = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'];
        try {
          const dynamicModels = await fetchAnthropicModels(tempApiKey.trim());
          if (dynamicModels.length > 0) models = dynamicModels;
        } catch(e) { console.warn("Failed to fetch Anthropic models, using fallback", e); }
        setAvailableModels(models);
        if (models.includes('claude-3-5-sonnet-20240620')) setSelectedModel('claude-3-5-sonnet-20240620');
        else setSelectedModel(models[0]);
      } else if (tempProvider === 'ollama') {
        setAvailableModels(['llama3', 'gemma2']);
        setSelectedModel('gemma2');
      }
      setKeySuccess(true);
    } catch (err) {
      setKeyError(t('onboarding.keyInvalid', 'המפתח אינו חוקי. אנא ודא שהעתקת אותו נכון.'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleAISetupNext = async () => {
    if (tempApiKey.trim() || tempProvider === 'ollama') {
      setIsValidating(true);
      if (tempProvider === 'gemini') {
        try {
          const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${tempApiKey.trim()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] }),
          });
          if (!testRes.ok) {
             showToast({ type: 'error', message: `המודל ${selectedModel} אינו תומך בפעולה זו (שגיאה ${testRes.status}). אנא בחר מודל אחר.` });
             setIsValidating(false);
             return;
          }
        } catch (err) {
           showToast({ type: 'error', message: `שגיאת רשת בבדיקת המודל ${selectedModel}.` });
           setIsValidating(false);
           return;
        }
      }
      setIsValidating(false);

      setProvider(tempProvider);
      setApiKey(tempApiKey.trim());
      setAllGeminiModels(selectedModel);
      setSkipAI(false);
      next();
    } else {
      setSkipAI(true);
      showToast({ type: 'warning', message: t('onboarding.aiDisabledWarning', 'AI features like document scanning are disabled.') });
      next();
    }
  };

  const handleSkipAI = () => {
    setSkipAI(true);
    showToast({ type: 'warning', message: t('onboarding.aiDisabledWarning', 'AI features like document scanning are disabled.') });
    next();
  };

  const handleAddTextSegment = async () => {
    if (!currentSegmentText.trim() || skipAI) return;
    setExtracting(true);
    try {
      const graph = await extractSemanticGraph(
        currentSegmentText,
        getProviderForTask('extraction'),
        {
          tripDestinations: form.destinations.split(',').map((d) => d.trim()),
          tripDates: `${form.startDate} to ${form.endDate}`,
        },
      );
      updateTripGraph(graph);
      const constraints = getConstraints(graph);
      setConstraintCount(prev => prev + constraints.length);
      
      
      const summary = constraints.length > 0 
        ? constraints.map(c => c.type).slice(0, 3).join(', ') 
        : 'טקסט כללי';

      setAddedSegments(prev => [...prev, {
        id: Date.now().toString(),
        type: 'text',
        title: `טקסט (${summary})`,
        constraintsFound: constraints.length
      }]);
      
      setForm(prev => ({ ...prev, bookings: prev.bookings + '\n\n---\n\n' + currentSegmentText }));
      setCurrentSegmentText('');
      showToast({ type: 'success', message: t('onboarding.addedSuccess', `Added. Found ${constraints.length} constraints.`) });
    } catch {
      showToast({ type: 'error', message: t('app.error', 'Failed to analyze text.') });
    } finally {
      setExtracting(false);
    }
  };

  const processFile = async (file: File) => {
    if (skipAI) return;
    setExtracting(true);
    try {
      let base64 = '';
      if (file.type.startsWith('image/')) {
        base64 = await compressImageToBase64(file);
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read document'));
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
      }

      const graph = await extractSemanticGraphFromFile(
        base64,
        file.type,
        getProviderForTask('extraction'),
        {
          tripDestinations: form.destinations.split(',').map((d) => d.trim()),
          tripDates: `${form.startDate} to ${form.endDate}`,
        }
      );
      updateTripGraph(graph);
      const constraints = getConstraints(graph);
      setConstraintCount(prev => prev + constraints.length);
      const summary = constraints.length > 0 
        ? constraints.map(c => c.type).slice(0, 3).join(', ') 
        : 'מסמך כללי';

      setAddedSegments(prev => [...prev, {
        id: Date.now().toString(),
        type: 'file',
        title: `${file.name || 'תמונה/מסמך'} (${summary})`,
        constraintsFound: constraints.length
      }]);
      
      const fileContext = `\n\n--- Document: ${file.name || 'Image'} ---\nFound Constraints:\n${JSON.stringify(constraints, null, 2)}`;
      setForm(prev => ({ ...prev, bookings: prev.bookings + fileContext }));
      showToast({ type: 'success', message: t('onboarding.addedSuccess', `Analyzed document. Found ${constraints.length} constraints.`) });
    } catch (err) {
      showToast({ type: 'error', message: t('app.error', 'Failed to analyze document.') });
    } finally {
      setExtracting(false);
    }
  };

  const handleAddFileSegment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (e.target) e.target.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      const file = e.clipboardData.files[0];
      await processFile(file);
    }
  };

  const createTrip = async () => {
    if (!appUser) return;
    setGenerating(true);
    try {
      const tripId = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const profile: TripProfile = {
        id: tripId,
        name: form.name || 'My Trip',
        destinations: form.destinations.split(',').map((d) => d.trim()).filter(Boolean),
        startDate: form.startDate,
        endDate: form.endDate,
        budget: Number(form.budget) || 0,
        currency: form.currency,
        pace: form.pace,
        preferences: form.preferences,
        tripStyle: form.tripStyle,
        participants: [{ email: appUser.email, name: appUser.name || appUser.email.split('@')[0], role: 'admin' }],
        phase: 'pre',
        createdBy: appUser.email,
      };

      // Write trip to Firestore
      await setDoc(doc(db, 'trips', tripId, 'profile', 'main'), profile);
      await setDoc(doc(db, 'trips', tripId, 'users', appUser.email), {
        email: appUser.email,
        name: appUser.name || appUser.email.split('@')[0],
        role: 'admin',
      });

      // Save active trip ID to user settings
      await setDoc(doc(db, 'users', appUser.email, 'settings', 'app'), { activeTripId: tripId }, { merge: true });

      // Save onboarding tripGraph to Firestore
      const tripGraph = useAIStore.getState().tripGraph;
      if (tripGraph && tripGraph.nodes.length > 0) {
        await setDoc(doc(db, 'trips', tripId, 'profile', 'graph'), tripGraph);
      }

      // Add to user's trips list
      await setDoc(doc(db, 'users', appUser.email), {
        trips: arrayUnion({ id: tripId, name: profile.name, destinations: profile.destinations })
      }, { merge: true });

      // Comprehensive AI Generation
      if (!skipAI && tempApiKey.trim()) {
        try {
          showToast({ type: 'info', message: t('onboarding.bgTaskGeneration', 'AI is building your comprehensive trip data...') });
          setGenerationProgress(t('onboarding.startingGeneration', 'מתחיל ניתוח...'));
          await generateComprehensiveTrip(
            profile, 
            form.bookings, 
            getProviderForTask('itinerary'), 
            i18n.language, 
            appUser.email,
            setGenerationProgress
          );
        } catch (aiErr: any) {
          console.error("AI Generation failed:", aiErr);
          
          // Revert trip creation to avoid empty trips
          await deleteDoc(doc(db, 'trips', tripId, 'profile', 'main'));
          await deleteDoc(doc(db, 'trips', tripId, 'users', appUser.email));
          await updateDoc(doc(db, 'users', appUser.email), {
            trips: arrayRemove({ id: tripId, name: profile.name, destinations: profile.destinations })
          });
          
          const errorMsg = aiErr?.message || String(aiErr);
          if (errorMsg.includes('429') || errorMsg.includes('Rate limit') || errorMsg.includes('quota') || errorMsg.includes('Too Many Requests')) {
            setKeyError('המפתח תקין אך חרגת ממכסת הבקשות (Rate Limit) למודל זה. אנא נסה מודל אחר או בדוק את מצב החשבון שלך.');
          } else {
            setKeyError(`שגיאה בתקשורת עם ה-AI: ${errorMsg}. אנא ודא שהמפתח תקין.`);
          }
          
          setStep(1); // Go back to API key selection
          throw new Error('AI_GENERATION_FAILED');
        }
      }

      setTripProfile(profile);
      setGeneratedTripId(tripId);
      showToast({ type: 'success', message: `Trip "${profile.name}" created! 🎉` });
      
    } catch (err: any) {
      console.error(err);
      if (err.message !== 'AI_GENERATION_FAILED') {
        showToast({ type: 'error', message: err.message || t('app.error') });
      }
    } finally {
      setGenerating(false);
      setGenerationProgress('');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appUser) return;
    
    setRestoring(true);
    try {
      showToast({ type: 'info', message: t('onboarding.restoringToast', 'Restoring trip...') });
      const newTripId = await restoreTripFromFile(file, appUser.email, appUser.name);
      showToast({ type: 'success', message: t('onboarding.restoreSuccess', 'Trip restored successfully! 🎉') });
    } catch (err) {
      showToast({ type: 'error', message: t('onboarding.restoreError', 'Failed to restore trip from file.') });
    } finally {
      setRestoring(false);
      if (e.target) e.target.value = '';
    }
  };

  const progress = ((step - 1) / (STEPS - 1)) * 100;

  if (restoring) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20 animate-fade-in">
        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">{t('onboarding.restoringTitle', 'Restoring your trip...')}</h2>
        <p className="text-slate-500 mt-2">{t('onboarding.restoringSubtitle', 'Please wait while we set everything up.')}</p>
      </div>
    );
  }

  // Full-screen loader for comprehensive AI Generation
  if (generating) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex flex-col items-center justify-center">
        <div className="w-24 h-24 relative mb-8">
          <div className="absolute inset-0 border-4 border-brand-200 dark:border-brand-900 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="text-brand-500 w-8 h-8 animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          {t('onboarding.generatingTitle', 'ה-AI בונה כעת את הטיול שלך...')}
        </h2>
        <div className="h-16 flex items-center justify-center">
          <p key={loadingPhraseIndex} className="text-brand-600 dark:text-brand-400 font-medium text-center max-w-sm px-4 animate-fade-in text-lg">
            {loadingPhrases[loadingPhraseIndex]}
          </p>
        </div>
      </div>
    );
  }

  // Success Screen
  if (generatedTripId) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex flex-col items-center justify-start p-4 pt-20 overflow-y-auto">
         <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-8 text-center animate-fade-in border border-slate-200 dark:border-slate-700">
           <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
           </div>
           <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">
             המסלול שלכם מוכן! 🎉
           </h2>
           <p className="text-slate-600 dark:text-slate-300 mb-6 text-lg leading-relaxed text-right" dir="rtl">
             הטיול תוכנן, המשימות ארוזות יפה והכל מחכה לכם. עכשיו זה הזמן שלכם:<br/><br/>
             ✨ <strong>לעבור על המסלול</strong> ולשנות אותו איך שבא לכם<br/>
             💬 <strong>לדבר עם העוזר האישי</strong> שלנו ולבקש בקשות מיוחדות<br/>
             🏨 <strong>להתחיל להזמין</strong> טיסות, מלונות ואטרקציות<br/>
             ✈️ והכי חשוב - <strong>להתכונן להרפתקה המדהימה</strong> שתכננתם!
           </p>
           <button 
             onClick={() => setCurrentTrip(generatedTripId)}
             className="btn-primary w-full text-lg py-4 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-shadow"
           >
             יאללה, בואו נראה! 🚀
           </button>
         </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <img src="/logo.png" alt="TripAp Logo" className="w-20 h-20 mx-auto mb-4 object-contain drop-shadow-xl" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('onboarding.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('onboarding.stepProgress', { step, total: STEPS, defaultValue: `Step ${step} of ${STEPS}` })}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-8">
        <div
          className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="card p-6 md:p-8">
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 flex justify-center items-center gap-2">
                ברוכים הבאים ל-TripAp! <img src="/logo.png" className="w-6 h-6 object-contain" alt="TripAp" />
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {t('onboarding.aiSetupDesc')}
              </p>
            </div>

            <div className="mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('settings.aiProvider')}
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
                <option value="ollama">Ollama (Local/Offline)</option>
              </select>
            </div>
            
            {/* API Key Guide */}
            {tempProvider === 'gemini' && (
              <div className="card p-5 bg-gradient-to-br from-brand-50 to-indigo-50 dark:from-brand-950/30 dark:to-indigo-950/30 border border-brand-100 dark:border-brand-800/50">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Sparkles className="text-brand-500 w-5 h-5" />
                  איך משיגים מפתח תוך דקה?
                </h3>
                
                <div className="space-y-4">
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      היכנסו לאתר <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">Google AI Studio</a> (התחברו עם חשבון גוגל).
                    </p>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      לחצו על הכפתור הכחול <span className="font-semibold bg-white dark:bg-slate-800 px-2 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">Create API key</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(tempProvider === 'openai' || tempProvider === 'anthropic') && (
              <p className="text-sm text-slate-500 mb-2">
                <a href={tempProvider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://console.anthropic.com/settings/keys'} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">
                  {t('onboarding.getApiKeyHelp')}
                </a>
              </p>
            )}

            {tempProvider !== 'ollama' && (
              <div className="mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('onboarding.geminiApiKey')}
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
                </div>
                <p className="text-xs text-slate-500 mt-2 flex items-start gap-1">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  {t('onboarding.apiKeyHelp')}
                </p>
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
                  <CheckCircle2 size={12} />
                  המפתח אומת בהצלחה!
                </p>
              )}
            </div>
            
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="flex items-center gap-3 cursor-pointer group mb-2">
                <input 
                  type="checkbox" 
                  checked={skipAI}
                  onChange={(e) => setSkipAI(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 transition-all cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                  דלג על AI כרגע (יצירת טיול ריק בלבד, ניתן להוסיף מפתח מאוחר יותר)
                </span>
              </label>
            </div>

            {availableModels.length > 0 && !skipAI && (
              <div className="mt-4 animate-fade-in">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('onboarding.selectModel', 'Select AI Model')}
                </label>
                <p className="text-xs text-brand-600 dark:text-brand-400 font-medium mb-2">
                  ✨ שימוש במודלים מתקדמים יותר יניב תוצאות טובות יותר בתכנון המסלול.
                </p>
                <select className="input-base" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Participants */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step2')}</h2>
            <div className="card p-4 bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-brand flex items-center justify-center text-white font-bold">
                  {appUser?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{appUser?.name}</p>
                  <p className="text-xs text-slate-500">{appUser?.email} · Admin</p>
                </div>
                <CheckCircle2 className="ms-auto text-green-500" size={18} />
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('onboarding.step2Help')}
            </p>
          </div>
        )}

        {/* Step 3: Trip Details */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step1')}</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.tripName')}</label>
              <input id="trip-name" className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('onboarding.tripNamePlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.destinations')}</label>
              <input id="trip-destinations" className="input-base" value={form.destinations} onChange={(e) => setForm({ ...form, destinations: e.target.value })} placeholder={t('onboarding.destinationsPlaceholder')} />
              <p className="text-xs text-slate-400 mt-1">{t('onboarding.destinationsHelp')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.startDate')}</label>
                <input id="trip-start" type="date" className="input-base w-full min-w-0" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.endDate')}</label>
                <input id="trip-end" type="date" className="input-base w-full min-w-0" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Budget & Preferences */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step3')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.budget')}</label>
                <input id="trip-budget" type="number" className="input-base" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="5000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.currency')}</label>
                <select id="trip-currency" className="input-base" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {['USD','EUR','GBP','ILS','ISK','JPY','AUD','CAD'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.pace')}</label>
              <div className="grid grid-cols-3 gap-3">
                {(['relaxed','moderate','intense'] as const).map((p) => (
                  <button
                    key={p}
                    id={`pace-${p}`}
                    onClick={() => setForm({ ...form, pace: p })}
                    className={`py-3 rounded-xl text-sm font-medium capitalize border-2 transition-all
                      ${form.pace === p
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                        : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    {t(`onboarding.${p}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.tripStyle', 'Trip Style')}</label>
              <div className="flex flex-wrap gap-2">
                {(['nature', 'city', 'food', 'diving', 'trekking', 'culture', 'shopping', 'relax'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        tripStyle: prev.tripStyle.includes(s) ? prev.tripStyle.filter(x => x !== s) : [...prev.tripStyle, s]
                      }))
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      form.tripStyle.includes(s) 
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {t(`styles.${s}`, s)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.preferencesLabel')}</label>
              <textarea
                id="trip-preferences"
                className="input-base h-28 resize-none"
                value={form.preferences}
                onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                placeholder={t('onboarding.preferences')}
              />
              <p className="text-xs text-slate-400 mt-1">{t('onboarding.preferencesHelp')}</p>
            </div>
          </div>
        )}

        {/* Step 5: Import Bookings */}
        {step === 5 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step4')}</h2>
            <div className="card p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 flex gap-3">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>{t('onboarding.semanticHelp1')}</strong> {t('onboarding.semanticHelp2')}
              </p>
            </div>

            {addedSegments.length > 0 && (
              <div className="space-y-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">מסמכים שנסרקו:</h3>
                {addedSegments.map((seg, idx) => (
                  <div key={seg.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 overflow-hidden">
                       <span className="font-bold text-brand-600">{idx + 1}.</span>
                       {seg.type === 'file' ? <FileText size={16} className="shrink-0 text-slate-400" /> : <FileText size={16} className="shrink-0 text-slate-400" />}
                       <span className="truncate font-medium">{seg.title}</span>
                    </div>
                    <span className="text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 px-2 py-1 rounded-full shrink-0">
                      {seg.constraintsFound} פרטים שחולצו
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 relative">
              <textarea
                className="input-base h-32 resize-none font-mono text-sm w-full"
                value={currentSegmentText}
                onChange={(e) => setCurrentSegmentText(e.target.value)}
                onPaste={handlePaste}
                placeholder={t('onboarding.pasteBookings', 'Paste text or images here...')}
                dir="auto"
                disabled={isExtracting}
              />
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                 <div className="flex gap-2 w-full sm:w-auto">
                    <label className="btn-secondary cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm py-2">
                      <Camera size={16} />
                      {t('itinerary.scanDoc', 'Scan Doc')}
                      <input type="file" accept="application/pdf, image/*" className="hidden" onChange={handleAddFileSegment} disabled={isExtracting} />
                    </label>
                 </div>
                 <button 
                   onClick={handleAddTextSegment} 
                   disabled={!currentSegmentText.trim() || isExtracting}
                   className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 text-sm py-2"
                 >
                   {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                   {t('app.add', 'Add')}
                 </button>
              </div>
            </div>

            {constraintCount > 0 && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium pt-4">
                <CheckCircle2 size={16} />
                {t('onboarding.constraintsFound', { count: constraintCount })} {t('onboarding.lockedToItinerary')}
              </div>
            )}
          </div>
        )}

        {/* Step 6: Review */}
        {step === 6 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step5')}</h2>
            
            {skipAI && (
              <div className="card p-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex gap-3 mb-4">
                <FileText size={18} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {t('onboarding.manualModeNotice', 'You are creating a manual trip without AI. To unlock automatic itinerary and task generation, add your API key in Settings.')}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {[
                { label: t('onboarding.tripName'), value: form.name || '—' },
                { label: t('onboarding.destinations'), value: form.destinations || '—' },
                { label: t('onboarding.dates'), value: form.startDate && form.endDate ? `${form.startDate} → ${form.endDate}` : '—' },
                { label: t('onboarding.budget'), value: form.budget ? `${form.budget} ${form.currency}` : '—' },
                { label: t('onboarding.pace'), value: t(`onboarding.${form.pace}`) },
                { label: t('onboarding.fixedBookings'), value: constraintCount > 0 ? t('onboarding.constraintsFound', { count: constraintCount }) : t('onboarding.none') },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {step > 1 && (
          <button id="btn-back" onClick={back} className="btn-secondary flex items-center gap-2" disabled={generating}>
            <ArrowLeft size={16} /> {t('app.back')}
          </button>
        )}

        {step === 1 && (
          <>
            {!skipAI && availableModels.length === 0 && (
              <button onClick={handleValidateKey} className="btn-secondary flex items-center gap-2" disabled={!tempApiKey.trim() || isValidating}>
                {isValidating ? <Loader2 size={16} className="animate-spin" /> : t('onboarding.validateKey', 'Validate')}
              </button>
            )}
            <button 
              onClick={skipAI ? handleSkipAI : handleAISetupNext} 
              className="btn-primary flex items-center gap-2 ms-auto" 
              disabled={(!skipAI && availableModels.length === 0)}
            >
              {t('app.continue', 'המשך')} <ArrowRight size={16} />
            </button>
          </>
        )}

        {step > 1 && step < 5 && (
          <button id="btn-next" onClick={next} className="btn-primary flex items-center gap-2 ms-auto">
            {t('app.next')} <ArrowRight size={16} />
          </button>
        )}

        {step === 5 && (
          <button
            id="btn-analyze"
            onClick={next}
            disabled={isExtracting}
            className="btn-primary flex items-center gap-2 ms-auto"
          >
            {isExtracting ? (
              <><Loader2 size={16} className="animate-spin" /> {t('app.loading', 'Loading...')}</>
            ) : (
              <><ArrowRight size={16} /> {t('onboarding.analyzeContinue', 'Continue to Review')}</>
            )}
          </button>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-4 w-full">
            {generating && (
              <div className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 p-4 rounded-xl text-center space-y-2 animate-pulse">
                <div className="flex justify-center mb-2"><Loader2 size={24} className="text-brand-500 animate-spin" /></div>
                <p className="font-bold text-brand-700 dark:text-brand-300">{generationProgress}</p>
                <p className="text-xs text-red-500 font-bold mt-2">⚠️ לא לרענן או לצאת מהמסך בזמן ניתוח ה AI!</p>
              </div>
            )}
            <button
              id="btn-create-trip"
              onClick={createTrip}
              disabled={generating || !form.name}
              className="btn-primary flex items-center justify-center gap-2 ms-auto mt-2"
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> {t('onboarding.generating')}</>
              ) : (
                <><Globe size={16} /> {t('onboarding.createTrip')}</>
              )}
            </button>
          </div>
        )}
      </div>

      {step === 1 && (
        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('onboarding.orRestore', 'Already have a trip backup file?')}</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700">
            <UploadCloud size={16} />
            {t('onboarding.restoreBtn', 'Restore Trip from File')}
            <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </label>
        </div>
      )}

      {showTos && <TermsOfServiceModal onClose={() => setShowTos(false)} />}
    </div>
  );
}
