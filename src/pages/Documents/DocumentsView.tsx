import React, { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Search, Loader2, Edit3, Trash2, X, ExternalLink, Link as LinkIcon, FileCheck } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTripStore, useUserRole, TripDocument } from '@/store/useTripStore';
import { db } from '@/services/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { showToast } from '@/components/ui/Toast';
import { extractDocumentData, integrateDocumentData, type DocumentExtractionResult } from '@/engine/documentAnalyzer';
import DocumentAnalysisReviewModal from '@/components/documents/DocumentAnalysisReviewModal';
import { useAuthStore } from '@/store/useAuthStore';
import { useAIStore } from '@/store/useAIStore';
import { compressImageToBase64 } from '@/utils/imageCompressor';

const DOC_LOADING_PHRASES = [
  'קורא את האותיות הקטנות...',
  'מפענח כתב חרטומים...',
  'מחפש את התאריכים החשובים...',
  'מסדר את כל המידע למסלול...',
  'מכין לך תקציר מושלם...'
];

export default function DocumentsView() {
  const { t } = useTranslation();
  const { currentTripId } = useTripStore();
  const userRole = useUserRole();
  const canWrite = userRole === 'admin' || userRole === 'editor';
  const { appUser } = useAuthStore();
  const { getProviderForTask, apiKey } = useAIStore();
  const { days } = useTripStore();
  const fileRef = React.useRef<HTMLInputElement>(null!);

  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TripDocument | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docLink, setDocLink] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);

  // Scanning State
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [scannedDocumentData, setScannedDocumentData] = useState<DocumentExtractionResult | null>(null);

  useEffect(() => {
    let interval: any;
    if (isScanningDoc) {
      interval = setInterval(() => {
        setPhraseIndex(p => (p + 1) % DOC_LOADING_PHRASES.length);
      }, 2000);
    } else {
      setPhraseIndex(0);
    }
    return () => clearInterval(interval);
  }, [isScanningDoc]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [swipedDocId, setSwipedDocId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  useEffect(() => {
    if (!currentTripId) return;
    setLoading(true);
    setDocuments([]);
    const unsub = onSnapshot(collection(db, 'trips', currentTripId, 'documents'), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as TripDocument));
      // Sort by creation date (newest first)
      docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setDocuments(docs);
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  const filteredDocs = documents.filter(d => 
    d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openDocModal = (docToEdit?: TripDocument) => {
    if (docToEdit) {
      setEditingDoc(docToEdit);
      setDocTitle(docToEdit.title);
      setDocContent(docToEdit.content);
      setDocLink(docToEdit.link || '');
    } else {
      setEditingDoc(null);
      setDocTitle('');
      setDocContent('');
      setDocLink('');
    }
    setIsModalOpen(true);
  };

  const saveDocument = async () => {
    if (!currentTripId || !docTitle.trim() || !docContent.trim()) {
      showToast({ type: 'error', message: t('documents.fillRequired', 'נא למלא כותרת ותוכן.') });
      return;
    }

    const docId = editingDoc ? editingDoc.id : crypto.randomUUID();
    const now = Date.now();
    const newDoc: TripDocument = {
      id: docId,
      title: docTitle.trim(),
      content: docContent.trim(),
      createdAt: editingDoc ? editingDoc.createdAt : now,
      updatedAt: now,
    };
    if (docLink.trim()) {
      newDoc.link = docLink.trim();
    }

    try {
      await setDoc(doc(db, 'trips', currentTripId, 'documents', docId), newDoc);
      showToast({ type: 'success', message: t('documents.saved', 'המסמך נשמר בהצלחה!') });
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
      showToast({ type: 'error', message: t('documents.errorSave', 'שגיאה בשמירת המסמך.') });
    }
  };

  const deleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTripId) return;
    if (!window.confirm(t('documents.confirmDelete', 'האם אתה בטוח שברצונך למחוק מסמך זה?'))) return;

    try {
      await deleteDoc(doc(db, 'trips', currentTripId, 'documents', id));
      showToast({ type: 'success', message: t('documents.deleted', 'המסמך נמחק.') });
      if (editingDoc?.id === id) setIsModalOpen(false);
    } catch (e) {
      console.error(e);
      showToast({ type: 'error', message: t('documents.errorDelete', 'שגיאה במחיקת המסמך.') });
    }
  };

  const processFile = async (file: File) => {
    if (!currentTripId || !appUser || !canWrite) return;
    
    if (!apiKey) {
      showToast({ type: 'warning', message: t('itinerary.missingApiKey', 'Please set your Gemini API key in Settings first.') });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    // Optional: Basic file type validation
    const allowedTypes = ['image/', 'application/pdf', 'text/', 'application/msword', 'application/vnd.openxmlformats-officedocument'];
    if (!allowedTypes.some(t => file.type.startsWith(t)) && file.type !== '') {
      showToast({ type: 'error', message: t('documents.unsupportedFormat', 'פורמט קובץ לא נתמך. תומך בתמונות, מסמכי PDF, ורד וטקסט.') });
      return;
    }

    setIsScanningDoc(true);
    showToast({ type: 'info', message: t('itinerary.scanningDoc', 'סורק מסמך...') });

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
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
      } else if (file.type === 'application/msword' || file.name.endsWith('.doc')) {
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
      } else if (file.type.startsWith('image/')) {
        base64 = await compressImageToBase64(file);
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read document'));
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
      }

      const tripProfile = useTripStore.getState().tripProfile;
      if (!tripProfile) throw new Error('No trip profile');

      const res = await extractDocumentData(
        tripProfile,
        base64,
        file.type,
        getProviderForTask('extraction'),
        textContent
      );
      
      setScannedDocumentData(res);
    } catch (err) {
      showToast({ type: 'error', message: t('errors.scanFailed', 'Failed to scan document.') });
    } finally {
      setIsScanningDoc(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirmScannedData = async (approvedData: DocumentExtractionResult) => {
    const tripProfile = useTripStore.getState().tripProfile;
    if (!tripProfile || !appUser) return;
    setScannedDocumentData(null);
    showToast({ type: 'info', message: t('itinerary.savingScanned', 'שומר נתונים מאושרים...') });
    
    try {
      await integrateDocumentData(
        tripProfile,
        days,
        approvedData,
        appUser.email
      );



      showToast({ 
        type: 'success', 
        message: t('itinerary.scanSuccess', 'המסמך שולב בהצלחה!') 
      });
    } catch (err) {
      showToast({ type: 'error', message: t('errors.saveFailed', 'שגיאה בשמירת הנתונים.') });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div 
      className="space-y-4 animate-fade-in pb-24 relative"
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (canWrite) setIsDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (canWrite) setIsDragging(true); }}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 z-50 bg-brand-50/90 dark:bg-brand-900/40 backdrop-blur-sm border-2 border-dashed border-brand-500 rounded-2xl flex flex-col items-center justify-center"
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (canWrite && e.dataTransfer.files?.[0]) {
              processFile(e.dataTransfer.files[0]);
            }
          }}
        >
          <div className="w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-800 flex items-center justify-center text-brand-600 animate-bounce shadow-lg">
            <Plus size={40} />
          </div>
        </div>
      )}
      <input type="file" ref={fileRef} className="hidden" accept="image/*,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="text-brand-500" />
          {t('documents.title', 'מסמכים')}
        </h2>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder={t('documents.search', 'חיפוש במסמכים...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full input-field ps-9 py-2 text-sm bg-white dark:bg-slate-800"
            />
          </div>
          {canWrite && (
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => fileRef.current?.click()} 
                disabled={isScanningDoc}
                className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm shrink-0"
                title="סרוק מסמך בעזרת בינה מלאכותית"
              >
                {isScanningDoc ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                <span className="hidden sm:inline">סרוק מסמך</span>
              </button>
              <button onClick={() => openDocModal()} className="btn-primary flex items-center gap-2 py-2 px-3 text-sm shrink-0">
                <Plus size={16} /> <span className="hidden sm:inline">{t('documents.add', 'מסמך ידני')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl text-sm border border-blue-100 dark:border-blue-800/50 mb-6">
        <p className="flex items-start gap-2">
          <FileCheck className="shrink-0 mt-0.5" size={16} />
          <span>כאן נשמרים אוטומטית כל הטקסטים שמחולצים מהמסמכים שנסרקו (כרטיסי טיסה, הזמנות, וכו׳). ניתן גם להוסיף מסמכים וקישורים באופן ידני לגיבוי. התוכן השמור הוא רק הטקסט, ולכן אינו תופס מקום בענן האפליקציה!</span>
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('documents.empty', 'אין מסמכים עדיין')}</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            {t('documents.emptyDesc', 'מסמכים שנסרקו במהלך יצירת הטיול או באמצעות סריקת מסמכים במסלול יופיעו כאן.')}
          </p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          {t('documents.noResults', 'לא נמצאו מסמכים התואמים לחיפוש.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="relative overflow-hidden rounded-2xl">
              {/* Swipe Action Background */}
              <div className="absolute inset-y-0 right-0 flex items-center justify-end w-full pr-4 bg-red-500 rounded-2xl">
                <button
                  onClick={(e) => deleteDocument(doc.id, e)}
                  className="text-white p-2"
                >
                  <Trash2 size={24} />
                </button>
              </div>
              
              <div 
                onClick={() => openDocModal(doc)}
                onTouchStart={(e) => { touchStartX.current = e.changedTouches[0].screenX; }}
                onTouchEnd={(e) => {
                  const touchEndX = e.changedTouches[0].screenX;
                  if (touchStartX.current - touchEndX > 50) setSwipedDocId(doc.id);
                  else if (touchEndX - touchStartX.current > 50) setSwipedDocId(null);
                }}
                className={`bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-transform duration-300 cursor-pointer group flex flex-col h-48 relative z-10 ${swipedDocId === doc.id ? '-translate-x-20' : 'translate-x-0'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white line-clamp-2 text-base leading-tight">
                    {doc.title}
                  </h3>
                  {canWrite && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id, e); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 sm:group-hover:opacity-100 shrink-0 hidden sm:block"
                      title={t('common.delete', 'מחק')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              
              <div className="flex-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                {doc.content}
              </div>
              
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                {doc.link && (
                  <a 
                    href={doc.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-brand-500 hover:underline"
                  >
                    <LinkIcon size={12} /> {t('documents.openLink', 'קישור מצורף')}
                  </a>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Edit/View Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                {editingDoc ? (canWrite ? <Edit3 size={18} className="text-brand-500"/> : <FileText size={18} className="text-brand-500"/>) : <Plus size={18} className="text-brand-500"/>}
                {editingDoc ? (canWrite ? t('documents.edit', 'עריכת מסמך') : t('documents.view', 'צפייה במסמך')) : t('documents.addNew', 'הוספת מסמך חדש')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('documents.docTitle', 'כותרת')}</label>
                {canWrite ? (
                  <input 
                    type="text" 
                    value={docTitle} 
                    onChange={e => setDocTitle(e.target.value)} 
                    className="w-full input-field"
                    placeholder="לדוגמה: אישור הזמנת מלון - פריז"
                  />
                ) : (
                  <div className="font-bold text-slate-900 dark:text-white p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">{docTitle}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('documents.docLink', 'קישור אופציונלי (URL)')}</label>
                {canWrite ? (
                  <input 
                    type="url" 
                    value={docLink} 
                    onChange={e => setDocLink(e.target.value)} 
                    className="w-full input-field text-start"
                    dir="ltr"
                    placeholder="https://..."
                  />
                ) : (
                  docLink ? (
                    <a href={docLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-500 hover:underline p-3 bg-slate-50 dark:bg-slate-800 rounded-xl" dir="ltr">
                      <ExternalLink size={16} /> {docLink}
                    </a>
                  ) : <div className="text-sm text-slate-400 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">אין קישור</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('documents.docContent', 'תוכן המסמך')}</label>
                {canWrite ? (
                  <textarea 
                    value={docContent} 
                    onChange={e => setDocContent(e.target.value)} 
                    className="w-full input-field min-h-[200px] resize-y"
                    placeholder="הדבק כאן את תוכן המסמך או לחלופין הוא יאוכלס אוטומטית מסריקה..."
                  />
                ) : (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                    {docContent}
                  </div>
                )}
              </div>
            </div>

            {canWrite && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                  {t('common.cancel', 'ביטול')}
                </button>
                <button onClick={saveDocument} className="btn-primary px-6 py-2">
                  {t('common.save', 'שמור')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Document Scanning Review Modal */}
      {scannedDocumentData && createPortal(
        <DocumentAnalysisReviewModal
          data={scannedDocumentData}
          onConfirm={handleConfirmScannedData}
          onCancel={() => setScannedDocumentData(null)}
        />,
        document.body
      )}

      {/* Fun Scanning Loading Overlay */}
      {isScanningDoc && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
            <Loader2 size={48} className="animate-spin text-brand-500 mb-6" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 transition-opacity duration-300">
              {DOC_LOADING_PHRASES[phraseIndex]}
            </h3>
            <p className="text-sm text-slate-500">
              {t('app.loading', 'זה יכול לקחת כמה שניות...')}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
