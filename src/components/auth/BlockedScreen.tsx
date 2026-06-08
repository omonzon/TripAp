import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { auth } from '@/services/firebase';
import { signOut } from 'firebase/auth';

export function BlockedScreen() {
  const { t } = useTranslation();
  const { appUser, emailjsConfig } = useAuthStore();
  const [requestText, setRequestText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = () => {
    signOut(auth);
  };

  const handleSendRequest = async () => {
    if (!requestText.trim()) return;
    
    if (!emailjsConfig?.serviceId || !emailjsConfig?.templateId || !emailjsConfig?.publicKey) {
      setError(t('errors.emailConfigMissing', 'Email service is not configured. Please contact the administrator directly.'));
      return;
    }

    setSending(true);
    setError('');

    try {
      const message = `בקשת הסרת חסימה ממשתמש: ${appUser?.email}\n\nסיבת הבקשה:\n${requestText}`;
      
      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: emailjsConfig.serviceId,
          template_id: emailjsConfig.templateId,
          user_id: emailjsConfig.publicKey,
          template_params: {
            message: message,
            to_email: 'omonzon@gmail.com'
          }
        })
      });
      setSent(true);
    } catch (err) {
      setError(t('errors.networkError', 'Failed to send the request. Please try again later.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-8 border border-slate-100 dark:border-slate-800 text-center animate-fade-in relative overflow-hidden">
        
        {/* Background decorative blob */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-b-[50%]" />

        <div className="relative">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 rotate-12">
            <Lock size={32} />
          </div>
          
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
            החשבון חסום
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            הגישה לחשבון זה ({appUser?.email}) נחסמה על ידי מנהל המערכת.
          </p>

          {sent ? (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-xl mb-6 font-medium animate-fade-in">
              בקשתך נשלחה בהצלחה למנהל המערכת.
            </div>
          ) : (
            <div className="space-y-4 text-start mb-8">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                בקשה להסרת חסימה
              </label>
              <textarea
                value={requestText}
                onChange={e => setRequestText(e.target.value)}
                placeholder="אנא הסבר מדוע יש להסיר את החסימה..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[100px] resize-y"
                dir="auto"
              />
              
              {error && (
                <div className="text-red-500 text-sm font-medium">{error}</div>
              )}

              <button
                onClick={handleSendRequest}
                disabled={sending || !requestText.trim()}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Mail size={18} />
                    שלח בקשה למנהל
                  </>
                )}
              </button>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium flex items-center justify-center gap-2 mx-auto transition-colors"
          >
            חזור למסך ההתחברות <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
