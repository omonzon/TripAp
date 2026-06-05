import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Globe, Key, FileText, Info } from 'lucide-react';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, type TripProfile } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { extractSemanticGraph, getConstraints } from '@/engine/semanticEngine';
import { generateComprehensiveTrip } from '@/engine/comprehensiveGenerator';
import { showToast } from '@/components/ui/Toast';
import { restoreTripFromFile } from '@/services/backupService';
import { UploadCloud } from 'lucide-react';

const STEPS = 6;

export default function OnboardingView() {
  const { t, i18n } = useTranslation();
  const { appUser } = useAuthStore();
  const { setCurrentTrip, setTripProfile } = useTripStore();
  const { getProviderForTask, updateTripGraph, setExtracting, isExtracting, apiKey, setApiKey } = useAIStore();

  const [step, setStep] = useState(1);
  const [skipAI, setSkipAI] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey || '');
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
  });
  const [constraintCount, setConstraintCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const next = () => {
    let nextStep = step + 1;
    // If skipAI is true, jump from Step 3 (Trip Details) to Step 6 (Review)
    if (skipAI && nextStep === 4) {
      nextStep = 6;
    }
    setStep(Math.min(nextStep, STEPS));
  };
  
  const back = () => {
    let prevStep = step - 1;
    // If skipAI is true, jump back from Step 6 (Review) to Step 3 (Trip Details)
    if (skipAI && prevStep === 5) {
      prevStep = 3;
    }
    setStep(Math.max(prevStep, 1));
  };

  const handleAISetupNext = () => {
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey.trim());
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

  const analyzeBookings = async () => {
    if (!form.bookings.trim() || skipAI) { next(); return; }
    setExtracting(true);
    try {
      const graph = await extractSemanticGraph(
        form.bookings,
        getProviderForTask('extraction'),
        {
          tripDestinations: form.destinations.split(',').map((d) => d.trim()),
          tripDates: `${form.startDate} to ${form.endDate}`,
        },
      );
      updateTripGraph(graph);
      const constraints = getConstraints(graph);
      setConstraintCount(constraints.length);
      showToast({ type: 'success', message: t('onboarding.constraintsFound', { count: constraints.length }) });
    } catch {
      showToast({ type: 'warning', message: t('onboarding.analyzeWarning', 'Could not analyze bookings with AI. They will be saved as-is.') });
    } finally {
      setExtracting(false);
      next();
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
        participants: [{ email: appUser.email, name: appUser.name, role: 'admin' }],
        phase: 'pre',
      };

      // Write trip to Firestore
      await setDoc(doc(db, 'trips', tripId, 'profile', 'main'), profile);
      await setDoc(doc(db, 'trips', tripId, 'users', appUser.email), {
        email: appUser.email,
        name: appUser.name,
        role: 'admin',
      });

      // Save active trip ID to user settings
      await setDoc(doc(db, 'users', appUser.email, 'settings', 'app'), { activeTripId: tripId }, { merge: true });

      // Add to user's trips list
      await setDoc(doc(db, 'users', appUser.email), {
        trips: arrayUnion({ id: tripId, name: profile.name, destinations: profile.destinations })
      }, { merge: true });

      // Comprehensive AI Generation
      if (!skipAI && tempApiKey.trim()) {
        showToast({ type: 'info', message: t('onboarding.bgTaskGeneration', 'AI is building your comprehensive trip data...') });
        await generateComprehensiveTrip(
          profile, 
          form.bookings, 
          getProviderForTask('itinerary'), 
          i18n.language, 
          appUser.email
        );
      }

      setTripProfile(profile);
      setCurrentTrip(tripId);
      showToast({ type: 'success', message: `Trip "${profile.name}" created! 🎉` });
      
    } catch (err) {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setGenerating(false);
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
          {t('onboarding.generatingTitle', 'AI is building your trip...')}
        </h2>
        <p className="text-slate-500 text-center max-w-sm px-4">
          {t('onboarding.generatingSubtitle', 'We are generating your itinerary, tasks, extracting expenses, and organizing documents. This takes about 15-30 seconds.')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl gradient-brand mx-auto mb-4 flex items-center justify-center shadow-lg">
          <Globe className="w-7 h-7 text-white" />
        </div>
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
        {/* Step 1: AI Setup */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.aiSetupTitle', 'AI Integration')}</h2>
            
            <div className="card p-5 bg-gradient-to-r from-brand-50 to-indigo-50 dark:from-brand-950/20 dark:to-indigo-950/20 border-brand-100 dark:border-brand-800/50">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center shrink-0">
                  <Sparkles className="text-brand-600 dark:text-brand-400 w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                    {t('onboarding.aiSuperpowers', 'Unlock AI Superpowers')}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t('onboarding.aiSetupDesc', 'Provide your Gemini API key to let the AI automatically build your full itinerary, generate smart tasks, and scan your documents and expenses.')}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('onboarding.geminiApiKey', 'Gemini API Key')}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-brand-600 transition-colors" title={t('onboarding.getApiKeyHelp', 'Get your free API key here')}>
                  <Info size={16} />
                </a>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key size={16} className="text-slate-400" />
                </div>
                <input 
                  type="password" 
                  className="input-base pl-10" 
                  value={tempApiKey} 
                  onChange={(e) => setTempApiKey(e.target.value)} 
                  placeholder="AIzaSy..." 
                  dir="ltr"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {t('onboarding.apiKeyHelp', 'Your key is saved locally in your browser and never sent to our servers.')}
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Participants */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step2')}</h2>
            <div className="card p-4 bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-brand flex items-center justify-center text-white font-bold">
                  {appUser?.name[0]?.toUpperCase()}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.startDate')}</label>
                <input id="trip-start" type="date" className="input-base" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.endDate')}</label>
                <input id="trip-end" type="date" className="input-base" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Budget & Preferences */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step3')}</h2>
            <div className="grid grid-cols-2 gap-4">
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
            <textarea
              id="trip-bookings"
              className="input-base h-48 resize-none font-mono text-sm"
              value={form.bookings}
              onChange={(e) => setForm({ ...form, bookings: e.target.value })}
              placeholder={t('onboarding.pasteBookings')}
              dir="auto"
            />
            {constraintCount > 0 && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
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
            <button onClick={handleSkipAI} className="btn-secondary ms-auto px-6">
              {t('app.skip', 'Skip')}
            </button>
            <button onClick={handleAISetupNext} className="btn-primary flex items-center gap-2" disabled={!tempApiKey.trim()}>
              {t('app.next')} <ArrowRight size={16} />
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
            onClick={analyzeBookings}
            disabled={isExtracting}
            className="btn-primary flex items-center gap-2 ms-auto"
          >
            {isExtracting ? (
              <><Loader2 size={16} className="animate-spin" /> {t('onboarding.analyzing')}</>
            ) : (
              <><Sparkles size={16} /> {t('onboarding.analyzeContinue')}</>
            )}
          </button>
        )}

        {step === 6 && (
          <button
            id="btn-create-trip"
            onClick={createTrip}
            disabled={generating || !form.name}
            className="btn-primary flex items-center gap-2 ms-auto"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> {t('onboarding.generating')}</>
            ) : (
              <><Globe size={16} /> {t('onboarding.createTrip')}</>
            )}
          </button>
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
    </div>
  );
}
