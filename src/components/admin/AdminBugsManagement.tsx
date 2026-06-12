import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { X, Search, Filter, MessageSquare, AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, Send, Sparkles, Loader2, Download, ExternalLink, RefreshCw, Pen, Lightbulb } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { showToast } from '@/components/ui/Toast';

interface BugReport {
  id: string;
  userId: string;
  userName?: string;
  text: string;
  image?: string;
  type?: 'bug' | 'feature';
  createdAt: any;
  status?: 'pending' | 'in_progress' | 'done' | 'rejected';
  adminNotes?: string;
  adminReply?: string;
  currentTripId?: string;
}

interface AdminBugsManagementProps {
  onClose: () => void;
}

export function AdminBugsManagement({ onClose }: AdminBugsManagementProps) {
  const { appUser } = useAuthStore();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Edit states for selected bug
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingAgent, setIsSendingAgent] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'bugs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as BugReport));
      setBugs(data);
      if (selectedBug) {
        const updated = data.find(b => b.id === selectedBug.id);
        if (updated) setSelectedBug(updated);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBug?.id]);

  useEffect(() => {
    if (selectedBug) {
      setNotes(selectedBug.adminNotes || '');
      setReply(selectedBug.adminReply || '');
    }
  }, [selectedBug]);

  const filteredBugs = bugs.filter(b => {
    const s = b.status || 'pending';
    const t = b.type || 'bug';
    if (filterStatus !== 'all' && s !== filterStatus) return false;
    if (filterType !== 'all' && t !== filterType) return false;
    if (search && !b.text.toLowerCase().includes(search.toLowerCase()) && !b.userId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status?: string) => {
    const s = status || 'pending';
    switch (s) {
      case 'pending': return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><Clock size={12}/> ממתין</span>;
      case 'in_progress': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><RefreshCw size={12}/> בטיפול</span>;
      case 'done': return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12}/> בוצע</span>;
      case 'rejected': return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><X size={12}/> נדחה</span>;
      default: return null;
    }
  };

  const handleUpdateStatus = async (status: 'pending' | 'in_progress' | 'done' | 'rejected') => {
    if (!selectedBug) return;
    try {
      await updateDoc(doc(db, 'bugs', selectedBug.id), { status });
      showToast({ type: 'success', message: 'סטטוס התעדכן' });
    } catch (err) {
      showToast({ type: 'error', message: 'שגיאה בעדכון הסטטוס' });
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedBug) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'bugs', selectedBug.id), { adminNotes: notes });
      showToast({ type: 'success', message: 'הערות נשמרו' });
    } catch (err) {
      showToast({ type: 'error', message: 'שגיאה בשמירת ההערות' });
    }
    setIsSaving(false);
  };

  const handleSendReply = async () => {
    if (!selectedBug || !reply.trim() || !appUser) return;
    setIsSaving(true);
    try {
      // 1. Update the bug doc
      await updateDoc(doc(db, 'bugs', selectedBug.id), { adminReply: reply });
      
      // 2. Send an In-App Notification to the user
      await addDoc(collection(db, 'users', selectedBug.userId, 'notifications'), {
        senderId: 'admin',
        senderName: 'צוות TripAp',
        type: 'bug_reply',
        message: `תשובה לפנייתך: ${reply}`,
        bugId: selectedBug.id,
        createdAt: new Date().toISOString(),
        read: false
      });
      
      showToast({ type: 'success', message: 'תשובה נשלחה למשתמש' });
    } catch (err) {
      showToast({ type: 'error', message: 'שגיאה בשליחת התשובה' });
    }
    setIsSaving(false);
  };

  const handleSendToAgent = async () => {
    if (!selectedBug || !appUser) return;
    setIsSendingAgent(true);
    try {
      const commandText = `Please fix this bug reported by user ${selectedBug.userId}.
Bug description: ${selectedBug.text}

Admin Notes: ${notes}

Make sure to apply the fix, test it, and commit. Then reply back.`;

      const cmdData: any = {
        userId: appUser.email,
        requestText: commandText,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      if (selectedBug.image) {
        cmdData.images = [selectedBug.image];
      }

      await addDoc(collection(db, 'agent_commands'), cmdData);
      showToast({ type: 'success', message: 'נשלח בהצלחה לטיפול הסוכן (Agent)!' });
    } catch (err) {
      showToast({ type: 'error', message: 'שגיאה בשליחה לסוכן' });
    }
    setIsSendingAgent(false);
  };

  const handleScanAndSummarize = async () => {
    if (!appUser) return;
    setIsScanning(true);
    try {
      const commandText = `Please generate a "Daily Summary Report" of all open bugs and feature requests.
Instructions:
1. Fetch all documents from the "bugs" collection where status is "pending" or "in_progress" (or empty).
2. Separate them into Bugs (type: 'bug') and Feature Requests (type: 'feature').
3. For bugs: Sort them by severity/importance and write a brief summary.
4. For feature requests: Give a score (1-10) for each request based on usefulness, and summarize them.
5. Send the final report as an email to ${appUser.email} using EmailJS (via the API).`;

      await addDoc(collection(db, 'agent_commands'), {
        userId: appUser.email,
        requestText: commandText,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      showToast({ type: 'success', message: 'בקשה לסריקה והפקת דוח נשלחה בהצלחה ל-AI Agent!' });
    } catch (err) {
      showToast({ type: 'error', message: 'שגיאה בשליחת הבקשה' });
    }
    setIsScanning(false);
  };

  const handleDownloadImage = (dataUrl: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center backdrop-blur-sm md:p-6" dir="rtl">
      <div className="bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row overflow-hidden w-full h-full max-w-7xl md:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800">
      {/* Sidebar List */}
      <div className={`w-full md:w-1/3 lg:w-1/4 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col ${selectedBug ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-brand-50/50 dark:bg-brand-900/10">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            מעקב באגים
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handleScanAndSummarize} disabled={isScanning} title="הפק דוח AI לכל הפתוחים" className="p-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full transition-colors dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50">
              {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors md:hidden">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-3 space-y-3 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="חיפוש לפי טקסט או משתמש..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-2 pr-9 pl-3 text-sm focus:ring-2 ring-brand-500 dark:text-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            <button onClick={() => setFilterType('all')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterType === 'all' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>הכל</button>
            <button onClick={() => setFilterType('bug')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterType === 'bug' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 dark:bg-red-900/20'}`}>באגים</button>
            <button onClick={() => setFilterType('feature')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterType === 'feature' ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20'}`}>הצעות</button>
          </div>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 border-t border-slate-100 dark:border-slate-800 pt-2">
            <button onClick={() => setFilterStatus('all')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterStatus === 'all' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>כל הסטטוסים</button>
            <button onClick={() => setFilterStatus('pending')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterStatus === 'pending' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20'}`}>ממתין</button>
            <button onClick={() => setFilterStatus('in_progress')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterStatus === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20'}`}>בטיפול</button>
            <button onClick={() => setFilterStatus('done')} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${filterStatus === 'done' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 dark:bg-green-900/20'}`}>בוצע</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-brand-500" /></div>
          ) : filteredBugs.length === 0 ? (
            <div className="text-center p-8 text-slate-400 text-sm">אין באגים להצגה</div>
          ) : (
            filteredBugs.map(bug => (
              <div 
                key={bug.id} 
                onClick={() => setSelectedBug(bug)}
                className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedBug?.id === bug.id ? 'bg-brand-50 border-brand-200 dark:bg-brand-900/20 dark:border-brand-800' : 'bg-white border-slate-200 hover:border-brand-300 dark:bg-slate-800 dark:border-slate-700'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-1 overflow-hidden">
                    {bug.type === 'feature' ? <Lightbulb size={12} className="text-indigo-500 flex-shrink-0" /> : <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                    <span className="text-xs font-medium text-slate-500 truncate" dir="ltr">{bug.userId}</span>
                  </div>
                  {getStatusBadge(bug.status)}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">{bug.text}</p>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                  <span className="text-[10px] text-slate-400">{bug.createdAt?.toDate ? bug.createdAt.toDate().toLocaleDateString() : 'Unknown'}</span>
                  {bug.image && <ImageIcon size={14} className="text-brand-500" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className={`flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 ${!selectedBug ? 'hidden md:flex items-center pt-24' : 'flex'}`}>
        {!selectedBug ? (
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-600 dark:text-slate-300">בחר באג מהרשימה</h3>
            <p className="text-slate-500 text-sm">כדי לצפות בפרטים ולנהל את הטיפול בו</p>
            <button onClick={onClose} className="btn-secondary mt-4">חזור להגדרות</button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedBug(null)} className="p-2 -mr-2 md:hidden hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                  <X size={20} />
                </button>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                    {selectedBug.type === 'feature' ? <Lightbulb className="text-indigo-500" /> : <AlertTriangle className="text-red-500" />}
                    {selectedBug.type === 'feature' ? 'הצעת ייעול' : 'פרטי דיווח'}
                  </h3>
                  <p className="text-xs text-slate-500" dir="ltr">{selectedBug.userId} {selectedBug.userName ? `(${selectedBug.userName})` : ''}</p>
                </div>
              </div>
              <button onClick={onClose} className="hidden md:flex p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
              
              {/* Report Content */}
              <div className="card p-5 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <MessageSquare size={18} className="text-brand-500" />
                    תוכן הדיווח
                  </h4>
                  <span className="text-xs text-slate-500">{selectedBug.createdAt?.toDate ? selectedBug.createdAt.toDate().toLocaleString() : ''}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                  {selectedBug.text}
                </div>
                
                {selectedBug.image && (
                  <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                      <ImageIcon size={16} className="text-brand-500" /> צילום מסך מצורף
                    </h4>
                    <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 inline-block">
                      <img src={selectedBug.image?.startsWith('data:') ? selectedBug.image : `data:image/jpeg;base64,${selectedBug.image}`} alt="Bug Screenshot" className="max-w-full md:max-w-md h-auto object-contain bg-black/5" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button onClick={() => window.open(selectedBug.image?.startsWith('data:') ? selectedBug.image : `data:image/jpeg;base64,${selectedBug.image}`, '_blank')} className="p-3 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm" title="פתח בחלון חדש">
                          <ExternalLink size={20} />
                        </button>
                        <button onClick={() => handleDownloadImage(selectedBug.image?.startsWith('data:') ? selectedBug.image : `data:image/jpeg;base64,${selectedBug.image}`, `bug_screenshot_${selectedBug.id}.jpg`)} className="p-3 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm" title="הורד תמונה">
                          <Download size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Control */}
              <div className="card p-5">
                <h4 className="font-bold text-slate-800 dark:text-white mb-3">סטטוס טיפול</h4>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleUpdateStatus('pending')} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectedBug.status === 'pending' || !selectedBug.status ? 'bg-yellow-500 text-white border-yellow-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>ממתין</button>
                  <button onClick={() => handleUpdateStatus('in_progress')} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectedBug.status === 'in_progress' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>בטיפול</button>
                  <button onClick={() => handleUpdateStatus('done')} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectedBug.status === 'done' ? 'bg-green-500 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>בוצע</button>
                  <button onClick={() => handleUpdateStatus('rejected')} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectedBug.status === 'rejected' ? 'bg-slate-700 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>נדחה</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Admin Notes */}
                <div className="card p-5 space-y-3">
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Pen size={18} className="text-slate-500" />
                    הערות מנהל (פנימי)
                  </h4>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="הערות לטיפול, רעיונות לפתרון..."
                    className="input-base w-full h-32 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveNotes} disabled={isSaving} className="btn-secondary flex-1">שמור הערות</button>
                    <button onClick={handleSendToAgent} disabled={isSendingAgent} className="btn-primary flex-1 bg-purple-600 hover:bg-purple-700 flex items-center justify-center gap-2">
                      {isSendingAgent ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      שלח ל-AI Agent
                    </button>
                  </div>
                </div>

                {/* Reply to User */}
                <div className="card p-5 space-y-3 border-2 border-brand-500/20">
                  <h4 className="font-bold text-brand-700 dark:text-brand-400 flex items-center gap-2">
                    <Send size={18} />
                    תשובה לשולח
                  </h4>
                  <p className="text-xs text-slate-500">התשובה תישלח למשתמש כהתראה (Notification) באפליקציה.</p>
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="היי, תודה על הדיווח! הנושא סודר..."
                    className="input-base w-full h-24 resize-none"
                  />
                  <button onClick={handleSendReply} disabled={isSaving || !reply.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    שלח תשובה למשתמש
                  </button>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
