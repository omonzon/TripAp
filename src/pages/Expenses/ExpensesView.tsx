import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { Camera, Plus, Trash2, Edit2, Loader2, Receipt } from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, useUserRole } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';
import { compressImageToBase64 } from '@/utils/imageCompressor';
import ExpenseAnalysisReviewModal from '@/components/expenses/ExpenseAnalysisReviewModal';

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
  authorName?: string;
  createdAt: number;
}

const CATEGORIES = ['food', 'supermarket', 'transportation', 'gifts', 'clothing', 'other'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'ISK', 'JPY', 'AUD', 'CAD', 'DKK', 'NOK', 'SEK'];

// Fallback rates if API fails
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, ILS: 3.75, ISK: 139,
  JPY: 150, AUD: 1.5, CAD: 1.37, DKK: 6.9, NOK: 10.7, SEK: 10.4,
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [pendingExpenses, setPendingExpenses] = useState<{ store: string; amount: number; currency: string; category: string }[] | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [form, setForm] = useState({
    store: '', amount: '', currency: 'USD', category: 'other', amountConverted: '', notes: ''
  });

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates) {
          setExchangeRates(data.rates);
        }
      })
      .catch(console.error);
  }, []);

  const toUSD = (amount: number, currency: string): number => {
    const cur = currency?.trim().toUpperCase() || 'USD';
    const map: Record<string, string> = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '£': 'GBP' };
    const cleanCur = map[cur] || cur;
    return amount / (exchangeRates[cleanCur] ?? 1);
  };
  const fileRef = useRef<HTMLInputElement>(null!);

  const userRole = useUserRole();
  const canWrite = userRole === 'admin' || userRole === 'editor';

  useEffect(() => {
    if (!currentTripId) return;
    setLoading(true);
    setExpenses([]);
    const q = query(collection(db, 'trips', currentTripId, 'expenses'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  // ── AI receipt and document scanner ───────────────────────────────────────────────
  const processFile = async (file: File) => {
    if (!file || !currentTripId || !appUser) return;
    setIsScanning(true);
    showToast({ type: 'info', message: t('expenses.scanning', 'סורק מסמך הוצאות...') });
    
    try {
      let base64 = '';
      let textContent: string | undefined = undefined;

      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        try {
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          textContent = result.value;
        } catch (e) {
          console.error("Failed to parse docx", e);
          throw new Error("Failed to parse DOCX");
        }
      } else if (file.type.startsWith('text/') || file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file);
        });
      } else if (file.type === 'application/pdf') {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else {
        // Assume image and use vision
        base64 = await compressImageToBase64(file);
      }

      const prompt = `Extract all expenses from the provided document. Return ONLY a valid JSON array of objects.
Format for each object: {"store":"string","amount":number,"currency":"ISK or EUR or USD or ILS etc","category":"food|supermarket|transportation|gifts|clothing|other"}.
If no expenses are found, return an empty array [].
${textContent ? `Document text:\n${textContent}` : ''}`;

      const aiOptions: any = { isJson: true, systemInstruction: "You are a receipt parser. Return only a JSON array." };
      if (base64) {
        aiOptions.base64Image = base64;
        aiOptions.mimeType = file.type || 'image/jpeg';
      }

      const text = await callAI(prompt, getProviderForTask(base64 ? 'vision' : 'extraction'), aiOptions);
      // Fallback: parseAIJson handles cases where it might return a single object by returning default. We want an array.
      let results = parseAIJson<{ store: string; amount: number; currency: string; category: string }[]>(text, []);
      
      // If AI returns a single object instead of array by mistake, wrap it
      if (!Array.isArray(results) && typeof results === 'object' && results !== null) {
        if ((results as any).amount) {
          results = [results as any];
        } else {
          results = [];
        }
      }

      if (!results || results.length === 0) {
         showToast({ type: 'warning', message: t('expenses.noExpensesFound', 'לא נמצאו הוצאות במסמך זה.') });
         setIsScanning(false);
         if (fileRef.current) fileRef.current.value = '';
         return;
      }

      setPendingExpenses(results);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error && err.message.includes('429')
        ? t('app.rateLimitError')
        : t('errors.scanFailed');
      showToast({ type: 'error', message: msg });
    } finally {
      setIsScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmPendingExpenses = async (approved: { store: string; amount: number; currency: string; category: string }[]) => {
    setPendingExpenses(null);
    if (!currentTripId || !appUser || approved.length === 0) return;
    
    let addedCount = 0;
    for (const result of approved) {
      if (!result.amount || !result.currency) continue;
      const converted = toUSD(result.amount, result.currency) * (exchangeRates[targetCurrency] ?? 1);
      const payload = {
        store: result.store ?? 'Unknown',
        amount: Number(result.amount),
        currency: result.currency ?? 'USD',
        category: result.category ?? 'other',
        amountConverted: converted,
        targetCurrency,
        notes: '',
      };
      await addDoc(collection(db, 'trips', currentTripId, 'expenses'), {
        ...payload,
        authorEmail: appUser.email,
        authorName: appUser.name,
        createdAt: Date.now()
      });
      addedCount++;
    }
    
    if (addedCount > 0) {
      showToast({ type: 'success', message: t('expenses.addedMultiple', `נוספו ${addedCount} הוצאות בהצלחה!`).replace('{{count}}', addedCount.toString()) });
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite) setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canWrite) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!canWrite) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const updateConverted = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) { setForm(f => ({ ...f, amountConverted: '' })); return; }
    const converted = (toUSD(num, currency) * (exchangeRates[targetCurrency] ?? 1)).toFixed(2);
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
    };
    if (editingId) {
      await updateDoc(doc(db, 'trips', currentTripId, 'expenses', editingId), payload);
    } else {
      await addDoc(collection(db, 'trips', currentTripId, 'expenses'), {
        ...payload,
        authorEmail: appUser.email,
        authorName: appUser.name,
        createdAt: Date.now()
      });
    }
    setShowForm(false); setEditingId(null);
    setForm({ store: '', amount: '', currency: 'USD', category: 'other', amountConverted: '', notes: '' });
    showToast({ type: 'success', message: t('expenses.expenseSaved') });
  };

  const totalUSD = expenses.reduce((acc, ex) => acc + toUSD(ex.amount, ex.currency), 0);
  const totalConverted = expenses.reduce((acc, ex) => acc + (ex.amountConverted || 0), 0);
  const budget = tripProfile?.budget ?? 0;
  const budgetPct = budget > 0 ? Math.min((totalConverted / budget) * 100, 100) : 0;

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div 
      className="space-y-5 animate-fade-in max-w-3xl mx-auto relative min-h-[60vh]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 bg-brand-50/90 dark:bg-brand-900/40 backdrop-blur-sm z-50 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-brand-500 animate-in fade-in"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-800 flex items-center justify-center mb-4 text-brand-600 animate-bounce shadow-lg">
            <Plus size={40} />
          </div>
          <h3 className="text-2xl font-bold text-brand-700 dark:text-brand-300">
            {t('expenses.dropFileHere', 'שחרר מסמך הוצאות כאן')}
          </h3>
          <p className="text-brand-600/80 dark:text-brand-400 mt-2">
            תמונות קבלה, מסמכי PDF, ורד (docx) או אקסל
          </p>
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('expenses.title')}</h2>

      {/* Budget progress */}
      {budget > 0 && (
        <div className="card p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700 dark:text-slate-300">{t('expenses.budget')}</span>
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
          <p className="text-xs text-slate-400 mt-1">{budgetPct.toFixed(0)}% {t('expenses.used')} · ≈{(totalConverted / Math.max(expenses.length, 1)).toFixed(0)} {targetCurrency} {t('expenses.avgPerExpense')}</p>
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
          <input ref={fileRef} type="file" accept="*/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) processFile(f); }} />
          <button
            onClick={() => { setForm({ store: '', amount: '', currency: 'USD', category: 'other', amountConverted: '', notes: '' }); setEditingId(null); setShowForm(true); }}
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
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>)}
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
                  {t('expenses.noExpenses')}
                </td></tr>
              ) : (
                expenses.map(ex => (
                  <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-medium text-slate-800 dark:text-white">
                      <div>{ex.store || '—'}</div>
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">{ex.authorName || ex.authorEmail?.split('@')[0]}</div>
                    </td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {ex.amount.toLocaleString()} <span className="text-xs font-normal text-slate-400">{ex.currency}</span>
                    </td>
                    <td className="p-3 font-bold text-brand-600 dark:text-brand-400">
                      {(ex.amountConverted || 0).toFixed(2)} <span className="text-xs font-normal text-slate-400">{ex.targetCurrency}</span>
                    </td>
                    <td className="p-3">
                      <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{t(`expenses.categories.${ex.category}`)}</span>
                    </td>
                    {canWrite && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button onClick={() => { 
                            setForm({ 
                              store: ex.store || '', 
                              amount: String(ex.amount || ''), 
                              currency: ex.currency || 'USD', 
                              category: ex.category || 'other', 
                              amountConverted: String(ex.amountConverted || ''), 
                              notes: ex.notes || '' 
                            }); 
                            setEditingId(ex.id); 
                            setShowForm(true); 
                            document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
                          }} className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg transition-colors"><Edit2 size={14} /></button>
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

      {pendingExpenses && (
        <ExpenseAnalysisReviewModal
          expenses={pendingExpenses}
          onConfirm={confirmPendingExpenses}
          onCancel={() => setPendingExpenses(null)}
        />
      )}
    </div>
  );
}
