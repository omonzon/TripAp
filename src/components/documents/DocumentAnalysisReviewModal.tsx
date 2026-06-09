import React, { useState } from 'react';
import { X, Check, FileText, Calendar, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DocumentExtractionResult } from '@/engine/documentAnalyzer';

interface DocumentAnalysisReviewModalProps {
  data: DocumentExtractionResult;
  onConfirm: (approvedData: DocumentExtractionResult) => void;
  onCancel: () => void;
}

export default function DocumentAnalysisReviewModal({ data, onConfirm, onCancel }: DocumentAnalysisReviewModalProps) {
  const { t } = useTranslation();
  
  // Track selected indices for each category
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set(data.itineraryEvents.map((_, i) => i)));
  const [selectedExpenses, setSelectedExpenses] = useState<Set<number>>(new Set(data.expenses.map((_, i) => i)));
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set(data.documents.map((_, i) => i)));
  const [saveFullText, setSaveFullText] = useState(!!data.fullText);

  const toggleEvent = (index: number) => {
    const next = new Set(selectedEvents);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedEvents(next);
  };

  const toggleExpense = (index: number) => {
    const next = new Set(selectedExpenses);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedExpenses(next);
  };

  const toggleDoc = (index: number) => {
    const next = new Set(selectedDocs);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedDocs(next);
  };

  const handleConfirm = () => {
    const approvedData: DocumentExtractionResult = {
      documentTitle: data.documentTitle,
      itineraryEvents: data.itineraryEvents.filter((_, i) => selectedEvents.has(i)),
      expenses: data.expenses.filter((_, i) => selectedExpenses.has(i)),
      documents: data.documents.filter((_, i) => selectedDocs.has(i)),
      fullText: saveFullText ? data.fullText : undefined
    };
    onConfirm(approvedData);
  };

  const isEmpty = data.itineraryEvents.length === 0 && data.expenses.length === 0 && data.documents.length === 0 && !data.fullText;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <FileText size={20} className="text-brand-500" />
              {t('documents.reviewScanned', 'אישור פרטים מהמסמך')}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {t('documents.reviewScannedDesc', 'בחר אילו מהפרטים שזיהינו ברצונך להוסיף לטיול.')}
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
              לא זוהו פרטים שניתן להוסיף לטיול מתוך המסמך.
            </div>
          ) : (
            <>
              {data.itineraryEvents.length > 0 && (
                <section>
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <Calendar size={16} className="text-brand-500" />
                    אירועים למסלול
                  </h4>
                  <div className="space-y-2">
                    {data.itineraryEvents.map((ev, i) => (
                      <label key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={selectedEvents.has(i)} onChange={() => toggleEvent(i)} className="mt-1" />
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white" dir="auto">{ev.title || 'אירוע'}</div>
                          <div className="text-xs text-slate-500 mb-1">{ev.isoDate}</div>
                          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc list-inside">
                            {ev.items.map((item, idx) => (
                              <li key={idx} dir="auto">{item.text}</li>
                            ))}
                          </ul>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {data.expenses.length > 0 && (
                <section>
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <DollarSign size={16} className="text-green-500" />
                    הוצאות
                  </h4>
                  <div className="space-y-2">
                    {data.expenses.map((exp, i) => (
                      <label key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={selectedExpenses.has(i)} onChange={() => toggleExpense(i)} />
                        <div className="flex-1" dir="auto">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">{exp.store}</span>
                          {exp.notes && <span className="text-xs text-slate-500 ms-2">({exp.notes})</span>}
                        </div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white" dir="ltr">
                          {exp.amount} {exp.currency}
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {data.documents.length > 0 && (
                <section>
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <FileText size={16} className="text-blue-500" />
                    פרטי מסמך נוספים
                  </h4>
                  <div className="space-y-2">
                    {data.documents.map((doc, i) => (
                      <label key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={selectedDocs.has(i)} onChange={() => toggleDoc(i)} />
                        <div className="flex-1" dir="auto">
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">{doc.title}</div>
                          <div className="text-xs text-slate-500" dir="ltr">{doc.referenceNumber}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {data.fullText && (
                <section>
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={saveFullText} onChange={() => setSaveFullText(!saveFullText)} />
                    <div className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                      שמור את תוכן המסמך המלא ב"מסמכים"
                    </div>
                  </label>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
          <button onClick={onCancel} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            {t('common.cancel', 'ביטול')}
          </button>
          {!isEmpty && (
            <button onClick={handleConfirm} className="btn-primary px-6 py-2 flex items-center gap-2">
              <Check size={16} />
              {t('common.confirm', 'אשר והוסף')}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
