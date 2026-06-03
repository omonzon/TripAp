import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { Camera, Plus, Trash2, Edit2, Loader2, Receipt } from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';

interface Expense {
  id: string;
  store: string;
  amount: number;
  currency: string;
  category: string;
  amountConverted: number;
  targetCurrency: string;
  notes: string;
  authorEmail: string;
  createdAt: number;
}

const CATEGORIES = ['מסעדה', 'סופרמרקט', 'תחבורה', 'מתנות', 'ביגוד', 'אחר'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'ISK', 'JPY', 'AUD', 'CAD', 'DKK', 'NOK', 'SEK'];

// Simple hardcoded rates relative to USD (real app would use an exchange API)
const RATES: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, ILS: 0.27, ISK: 0.0072,
  JPY: 0.0067, AUD: 0.65, CAD: 0.73, DKK: 0.145, NOK: 0.093, SEK: 0.096,
};

function toUSD(amount: number, currency: string): number {
  return amount * (RATES[currency] ?? 1);
}

export default function ExpensesView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId, tripProfile } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const targetCurrency = tripProfile?.currency ?? 'USD';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [form, setForm] = useState({
    store: '', amount: '', currency: 'USD',
    category: 'אחר', amountConverted: '', notes: '',
  });
  const fileRef = useRef<HTMLInputElement>(null!);

  const canWrite = appUser?.role === 'admin' || appUser?.role === 'editor';

  useEffect(() => {
    if (!currentTripId) return;
    const q = query(collection(db, 'trips', currentTripId, 'expenses'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  // ── AI receipt scanner ────────────────────────────────────────────────────
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const prompt = `Analyze this receipt image. Return ONLY valid JSON: {"store":"string","amount":number,"currency":"ISK or EUR or USD etc","category":"מסעדה|סופרמרקט|תחבורה|מתנות|ביגוד|אחר"}`;
        const text = await callAI(prompt, getProviderForTask('vision'), { isJson: true, base64Image: base64, mimeType: file.type });
        const result = parseAIJson<{ store: string; amount: number; currency: string; category: string }>(text, { store: '', amount: 0, currency: 'USD', category: 'אחר' });
        const converted = (toUSD(result.amount, result.currency) / (RATES[targetCurrency] ?? 1)).toFixed(2);
        setForm({
          store: result.store ?? '',
          amount: String(result.amount ?? ''),
          currency: result.currency ?? 'USD',
          category: result.category ?? 'אחר',
          amountConverted: converted,
          notes: '',
        });
        setShowForm(true);
        setIsScanning(false);
      };
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.includes('429')
        ? t('app.rateLimitError')
        : t('errors.scanFailed');
      showToast({ type: 'error', message: msg });
      setIsScanning(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const updateConverted = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) { setForm(f => ({ ...f, amountConverted: '' })); return; }
    const converted = (toUSD(num, currency) / (RATES[targetCurrency] ?? 1)).toFixed(2);
    setForm(f => ({ ...f, amountConverted: converted }));
  };

  const saveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !currentTripId || !appUser) return;
    const payload = {
      store: form.store,
      amount: Number(form.amount),
      currency: form.currency,
      category: form.category,
      amountConverted: Number(form.amountConverted),
      targetCurrency,
      notes: form.notes,
      authorEmail: appUser.email,
      createdAt: Date.now(),
    };
    if (editingId) {
      await updateDoc(doc(db, 'trips', currentTripId, 'expenses', editingId), payload);
    } else {
      await addDoc(collection(db, 'trips', currentTripId, 'expenses'), payload);
    }
    setShowForm(false); setEditingId(null);
    setForm({ store: '', amount: '', currency: 'USD', category: 'אחר', amountConverted: '', notes: '' });
    showToast({ type: 'success', message: 'Expense saved!' });
  };

  const totalUSD = expenses.reduce((acc, ex) => acc + toUSD(ex.amount, ex.currency), 0);
  const totalConverted = expenses.reduce((acc, ex) => acc + (ex.amountConverted || 0), 0);
  const budget = tripProfile?.budget ?? 0;
  const budgetPct = budget > 0 ? Math.min((totalConverted / budget) * 100, 100) : 0;

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('expenses.title')}</h2>

      {/* Budget progress */}
      {budget > 0 && (
        <div className="card p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700 dark:text-slate-300">תקציב</span>
            <span className={`font-bold ${budgetPct > 90 ? 'text-red-500' : budgetPct > 70 ? 'text-amber-500' : 'text-green-600'}`}>
              {totalConverted.toFixed(0)} / {budget} {targetCurrency}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">{budgetPct.toFixed(0)}% used · ≈{(totalConverted / Math.max(expenses.length, 1)).toFixed(0)} {targetCurrency}/expense avg</p>
        </div>
      )}

      {/* Action buttons */}
      {canWrite && (
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current.click()}
            disabled={isScanning}
            id="btn-scan-receipt"
            className="btn-primary flex items-center gap-2 flex-1"
          >
            {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {t('expenses.scan')}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} />
          <button
            onClick={() => { setForm({ store: '', amount: '', currency: 'USD', category: 'אחר', amountConverted: '', notes: '' }); setEditingId(null); setShowForm(true); }}
            id="btn-add-expense"
            className="btn-secondary flex items-center gap-2 flex-1"
          >
            <Plus size={18} /> {t('expenses.addManual')}
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-5 animate-slide-up">
          <form onSubmit={saveExpense} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-3 flex gap-2 items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 bg-white dark:bg-slate-800">
              <input type="text" placeholder={t('expenses.store')} value={form.store} onChange={e => setForm({ ...form, store: e.target.value })} className="flex-1 py-2.5 bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white" />
              <DictationButton onResult={t2 => setForm(f => ({ ...f, store: f.store + (f.store ? ' ' : '') + t2 }))} />
            </div>
            <input type="number" step="0.01" placeholder={t('expenses.amount') + ' *'} value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); updateConverted(e.target.value, form.currency); }} className="input-base" required />
            <select value={form.currency} onChange={e => { setForm({ ...form, currency: e.target.value }); updateConverted(form.amount, e.target.value); }} className="input-base">
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-base">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="number" step="0.01" placeholder={`${t('expenses.convertedAmount')} (${targetCurrency})`} value={form.amountConverted} onChange={e => setForm({ ...form, amountConverted: e.target.value })} className="input-base" />
            <div className="col-span-2 sm:col-span-2 flex gap-2 items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 bg-white dark:bg-slate-800">
              <input type="text" placeholder={t('expenses.notes')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="flex-1 py-2.5 bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white" />
              <DictationButton onResult={t2 => setForm(f => ({ ...f, notes: f.notes + (f.notes ? ' ' : '') + t2 }))} />
            </div>
            <div className="col-span-2 sm:col-span-3 flex gap-2 mt-1">
              <button type="submit" className="btn-primary flex-1">{t('app.save')}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">{t('app.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-start p-3 font-semibold text-slate-600 dark:text-slate-400">{t('expenses.store')}</th>
                <th className="text-start p-3 font-semibold text-slate-600 dark:text-slate-400">{t('expenses.amount')}</th>
                <th className="text-start p-3 font-semibold text-slate-600 dark:text-slate-400">{t('expenses.convertedAmount')}</th>
                <th className="text-start p-3 font-semibold text-slate-600 dark:text-slate-400">{t('expenses.category')}</th>
                {canWrite && <th className="p-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expenses.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No expenses yet
                </td></tr>
              ) : (
                expenses.map(ex => (
                  <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-medium text-slate-800 dark:text-white">{ex.store || '—'}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {ex.amount.toLocaleString()} <span className="text-xs font-normal text-slate-400">{ex.currency}</span>
                    </td>
                    <td className="p-3 font-bold text-brand-600 dark:text-brand-400">
                      {(ex.amountConverted || 0).toFixed(2)} <span className="text-xs font-normal text-slate-400">{ex.targetCurrency}</span>
                    </td>
                    <td className="p-3">
                      <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{ex.category}</span>
                    </td>
                    {canWrite && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setForm({ store: ex.store, amount: String(ex.amount), currency: ex.currency, category: ex.category, amountConverted: String(ex.amountConverted), notes: ex.notes }); setEditingId(ex.id); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg transition-colors"><Edit2 size={14} /></button>
                          <button onClick={async () => { if (currentTripId) await deleteDoc(doc(db, 'trips', currentTripId, 'expenses', ex.id)); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="p-3 font-bold text-slate-700 dark:text-slate-300">{t('expenses.totalConverted')}</td>
                  <td className="p-3 font-bold text-brand-700 dark:text-brand-300 text-base">
                    {totalConverted.toFixed(2)} {targetCurrency}
                  </td>
                  <td colSpan={canWrite ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

