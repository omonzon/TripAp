import React, { useState } from 'react';
import { X, Check, DollarSign, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExpenseResult {
  store: string;
  amount: number;
  currency: string;
  category: string;
}

interface ExpenseAnalysisReviewModalProps {
  expenses: ExpenseResult[];
  onConfirm: (approvedExpenses: ExpenseResult[]) => void;
  onCancel: () => void;
}

export default function ExpenseAnalysisReviewModal({ expenses, onConfirm, onCancel }: ExpenseAnalysisReviewModalProps) {
  const { t } = useTranslation();
  
  // Track selected indices for expenses
  const [selectedExpenses, setSelectedExpenses] = useState<Set<number>>(new Set(expenses.map((_, i) => i)));

  const toggleExpense = (index: number) => {
    const next = new Set(selectedExpenses);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedExpenses(next);
  };

  const handleSelectAll = () => {
    if (selectedExpenses.size === expenses.length) {
      setSelectedExpenses(new Set()); // Deselect all
    } else {
      setSelectedExpenses(new Set(expenses.map((_, i) => i))); // Select all
    }
  };

  const handleConfirm = () => {
    const approvedExpenses = expenses.filter((_, i) => selectedExpenses.has(i));
    onConfirm(approvedExpenses);
  };

  const isEmpty = expenses.length === 0;
  const isAllSelected = selectedExpenses.size === expenses.length && expenses.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign size={20} className="text-green-500" />
              {t('expenses.reviewTitle', 'אישור הוצאות מהמסמך')}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {t('expenses.reviewDesc', 'בחר אילו מההוצאות שזיהינו ברצונך להוסיף לטיול.')}
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isEmpty ? (
            <div className="text-center py-10 text-slate-500">
              {t('expenses.noExpensesFound', 'לא נמצאו הוצאות במסמך זה.')}
            </div>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <DollarSign size={16} className="text-green-500" />
                  {t('expenses.detectedExpenses', 'הוצאות שזוהו')} ({selectedExpenses.size}/{expenses.length})
                </h4>
                <button 
                  onClick={handleSelectAll}
                  className="text-xs flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-medium hover:bg-brand-50 dark:hover:bg-brand-900/30 px-2 py-1 rounded-md transition-colors"
                >
                  <ListChecks size={14} />
                  {isAllSelected ? t('expenses.deselectAll', 'אל תאשר הכל') : t('expenses.selectAll', 'אשר הכל')}
                </button>
              </div>
              <div className="space-y-2">
                {expenses.map((exp, i) => (
                  <label key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={selectedExpenses.has(i)} onChange={() => toggleExpense(i)} className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500" />
                    <div className="flex-1" dir="auto">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">{exp.store || 'Unknown'}</span>
                      <span className="text-xs text-slate-500 ms-2 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {t(`expenses.categories.${exp.category}`, exp.category)}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white" dir="ltr">
                      {exp.amount} {exp.currency}
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
          <button onClick={onCancel} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            {t('common.cancel', 'ביטול')}
          </button>
          {!isEmpty && (
            <button 
              onClick={handleConfirm} 
              disabled={selectedExpenses.size === 0}
              className="btn-primary px-6 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={16} />
              {t('common.confirm', 'אשר והוסף')}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
