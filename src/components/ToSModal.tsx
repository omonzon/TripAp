import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Check, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export function ToSModal() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleAgree = async () => {
    if (!appUser?.email) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', appUser.email);
      await setDoc(userRef, {
        tosAccepted: true,
        tosAcceptedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to accept ToS", err);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-sm flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        
        <div className="p-6 bg-brand-500 text-white flex items-center gap-3 shrink-0">
          <Shield className="w-8 h-8" />
          <h2 className="text-xl font-bold">{t('auth.tosTitle', 'Terms of Service & Liability Waiver')}</h2>
        </div>

        <div className="p-6 overflow-y-auto flex-1 text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p><strong>{t('auth.tosText1', "The app is provided 'AS IS'. The creator is not liable for any direct, indirect, incidental, or consequential damages, including but not limited to loss of data, financial losses, or physical harm.")}</strong></p>
          </div>
          <p>{t('auth.tosText2', "AI Limitations: AI suggestions (itineraries, tasks, tips) are generated automatically and may be inaccurate or unsafe. You must verify all information independently. The creator bears no responsibility for AI errors.")}</p>
          <p>{t('auth.tosText3', "Data Risk: Your data is stored on third-party servers. We do not guarantee data persistence or security. You are solely responsible for backing up your trips.")}</p>
          <p className="font-semibold text-brand-600 dark:text-brand-400">
            {t('auth.tosText4', "Acceptance: By using this application, you agree not to sue or hold the creator accountable for ANY damages arising from the use of this system.")}
          </p>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <button
            onClick={handleAgree}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={20} />}
            {t('auth.tosAgree', 'I have read, understood, and agree')}
          </button>
        </div>
        
      </div>
    </div>
  );
}
