import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Globe } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, type TripProfile } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { extractSemanticGraph, getConstraints } from '@/engine/semanticEngine';
import { generateTripTasks } from '@/engine/taskGenerator';
import { showToast } from '@/components/ui/Toast';

const STEPS = 5;

export default function OnboardingView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { setCurrentTrip, setTripProfile } = useTripStore();
  const { getProviderForTask, updateTripGraph, setExtracting, isExtracting } = useAIStore();

  const [step, setStep] = useState(1);
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

  const next = () => setStep((s) => Math.min(s + 1, STEPS));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const analyzeBookings = async () => {
    if (!form.bookings.trim()) { next(); return; }
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
      showToast({ type: 'warning', message: 'Could not analyze bookings with AI. They will be saved as-is.' });
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

      setTripProfile(profile);
      setCurrentTrip(tripId);
      showToast({ type: 'success', message: `Trip "${profile.name}" created! 🎉` });
      
      // Fire-and-forget task generation
      showToast({ type: 'info', message: 'AI is generating personalized tasks in the background...' });
      generateTripTasks(profile, getProviderForTask('itinerary'), 'he', appUser.email);
      
    } catch (err) {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setGenerating(false);
    }
  };

  const progress = ((step - 1) / (STEPS - 1)) * 100;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl gradient-brand mx-auto mb-4 flex items-center justify-center shadow-lg">
          <Globe className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('onboarding.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Step {step} of {STEPS}</p>
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
        {/* Step 1: Trip Details */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step1')}</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.tripName')}</label>
              <input id="trip-name" className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Iceland Adventure 2025" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.destinations')}</label>
              <input id="trip-destinations" className="input-base" value={form.destinations} onChange={(e) => setForm({ ...form, destinations: e.target.value })} placeholder="Reykjavik, Amsterdam, Paris" />
              <p className="text-xs text-slate-400 mt-1">Separate multiple destinations with commas</p>
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

        {/* Step 2: Participants - simplified for now */}
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
              You can invite more participants from Settings after the trip is created.
            </p>
          </div>
        )}

        {/* Step 3: Budget & Preferences */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step3')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('onboarding.budget')}</label>
                <input id="trip-budget" type="number" className="input-base" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="5000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Currency</label>
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Preferences & interests</label>
              <textarea
                id="trip-preferences"
                className="input-base h-28 resize-none"
                value={form.preferences}
                onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                placeholder={t('onboarding.preferences')}
              />
              <p className="text-xs text-slate-400 mt-1">The AI will use this to personalize your itinerary</p>
            </div>
          </div>
        )}

        {/* Step 4: Import Bookings */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step4')}</h2>
            <div className="card p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 flex gap-3">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Semantic AI extraction:</strong> Paste any booking confirmations, email text, or itinerary details.
                The AI will extract flights, hotels, tours as <em>fixed constraints</em> that cannot be moved.
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
                {t('onboarding.constraintsFound', { count: constraintCount })} locked to your itinerary
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.step5')}</h2>
            <div className="space-y-3">
              {[
                { label: 'Trip Name', value: form.name || '—' },
                { label: 'Destinations', value: form.destinations || '—' },
                { label: 'Dates', value: form.startDate && form.endDate ? `${form.startDate} → ${form.endDate}` : '—' },
                { label: 'Budget', value: form.budget ? `${form.budget} ${form.currency}` : '—' },
                { label: 'Pace', value: form.pace },
                { label: 'Fixed bookings', value: constraintCount > 0 ? `${constraintCount} detected` : 'None' },
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
          <button id="btn-back" onClick={back} className="btn-secondary flex items-center gap-2">
            <ArrowLeft size={16} /> {t('app.back')}
          </button>
        )}

        {step < 4 && (
          <button id="btn-next" onClick={next} className="btn-primary flex items-center gap-2 ms-auto">
            {t('app.next')} <ArrowRight size={16} />
          </button>
        )}

        {step === 4 && (
          <button
            id="btn-analyze"
            onClick={analyzeBookings}
            disabled={isExtracting}
            className="btn-primary flex items-center gap-2 ms-auto"
          >
            {isExtracting ? (
              <><Loader2 size={16} className="animate-spin" /> {t('onboarding.analyzing')}</>
            ) : (
              <><Sparkles size={16} /> Analyze & Continue</>
            )}
          </button>
        )}

        {step === 5 && (
          <button
            id="btn-create-trip"
            onClick={createTrip}
            disabled={generating || !form.name}
            className="btn-primary flex items-center gap-2 ms-auto"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> {t('onboarding.generating')}</>
            ) : (
              <><Globe size={16} /> Create Trip</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
