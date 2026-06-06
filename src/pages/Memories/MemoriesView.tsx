import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { Sparkles, MapPin, Image as ImageIcon, BookOpen, PenTool, Loader2, Link2, Share2, Copy, Lock, Users, FileText } from 'lucide-react';
import { useTripStore } from '@/store/useTripStore';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAIStore } from '@/store/useAIStore';
import { callAI } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';

function AlbumPreview({ url }: { url: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  
  useEffect(() => {
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success' && data.data?.image?.url) {
          setImgUrl(data.data.image.url);
        }
      })
      .catch(e => console.error(e));
  }, [url]);

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-all group bg-slate-50 dark:bg-slate-900">
      {imgUrl ? (
        <div className="h-24 w-full overflow-hidden relative">
          <img 
            src={imgUrl} 
            referrerPolicy="no-referrer"
            onError={() => setImgUrl(null)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            alt="Album Preview" 
          />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
             <ImageIcon className="text-white opacity-70" size={24} />
          </div>
        </div>
      ) : (
        <div className="h-24 w-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
          <Link2 className="text-slate-400" size={24} />
        </div>
      )}
      <div className="p-2 border-t border-slate-200 dark:border-slate-700">
        <p className="text-[10px] font-medium text-slate-500 truncate" dir="ltr">{url}</p>
      </div>
    </a>
  );
}

interface JournalEntry {
  id: string;
  text: string;
  createdAt: number;
  authorName: string;
  imageLink?: string;
}

export default function MemoriesView() {
  const { t, i18n } = useTranslation();
  const { currentTripId, tripProfile, days } = useTripStore();
  const { appUser } = useAuthStore();
  const { getProviderForTask, getUnifiedContext } = useAIStore();

  const [journalMode, setJournalMode] = useState<'group' | 'private'>('group');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  const [postLength, setPostLength] = useState<'short'|'medium'|'long'>('medium');
  const [generatedPost, setGeneratedPost] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newImageLink, setNewImageLink] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editImageLink, setEditImageLink] = useState('');

  // Load journal from Firestore
  useEffect(() => {
    if (!currentTripId || !appUser) return;
    const docId = journalMode === 'group' ? 'global' : `private_${appUser.email}`;
    setEntries([]); // clear while loading
    const unsub = onSnapshot(doc(db, 'trips', currentTripId, 'journal', docId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.entries) {
          setEntries(data.entries);
        } else if (data.text) { // fallback for old data format
          setEntries([{ id: 'old', text: data.text, createdAt: data.updatedAt || Date.now(), authorName: 'Unknown' }]);
        } else {
          setEntries([]);
        }
      } else {
        setEntries([]);
      }
    });
    return () => unsub();
  }, [currentTripId, journalMode, appUser]);

  const saveJournalEntry = async () => {
    if (!newEntry.trim() || !currentTripId || !appUser) return;
    setIsSaving(true);
    const docId = journalMode === 'group' ? 'global' : `private_${appUser.email}`;
    
    const newEntryObj: JournalEntry = {
      id: Date.now().toString(),
      text: newEntry.trim(),
      createdAt: Date.now(),
      authorName: appUser.name,
      imageLink: newImageLink.trim() || undefined
    };

    try {
      await setDoc(doc(db, 'trips', currentTripId, 'journal', docId), { 
        entries: [...entries, newEntryObj], 
        updatedAt: Date.now() 
      }, { merge: true });
      setNewEntry('');
      setNewImageLink('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!currentTripId || !appUser) return;
    if (!confirm(t('app.confirmDelete', 'Are you sure you want to delete this entry?'))) return;
    const docId = journalMode === 'group' ? 'global' : `private_${appUser.email}`;
    const newEntries = entries.filter(e => e.id !== entryId);
    try {
      await setDoc(doc(db, 'trips', currentTripId, 'journal', docId), { entries: newEntries, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const saveEditEntry = async () => {
    if (!currentTripId || !appUser || !editingId) return;
    const docId = journalMode === 'group' ? 'global' : `private_${appUser.email}`;
    const newEntries = entries.map(e => e.id === editingId ? { ...e, text: editText.trim(), imageLink: editImageLink.trim() || undefined } : e);
    try {
      await setDoc(doc(db, 'trips', currentTripId, 'journal', docId), { entries: newEntries, updatedAt: Date.now() }, { merge: true });
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const summarizeJournal = async () => {
    if (entries.length === 0) return;
    setIsSummarizing(true);
    try {
      const language = i18n.language === 'he' ? 'Hebrew' : 'English';
      const formattedJournal = entries.map(e => `[${new Date(e.createdAt).toLocaleString()}] ${e.authorName}: ${e.text}`).join('\n\n');
      const prompt = `Please summarize the following travel journal into a concise and well-structured format in ${language}. Use bullet points and capture the main events and feelings:\n\n${formattedJournal}`;
      const reply = await callAI(prompt, getProviderForTask('chat'));
      setGeneratedPost(reply.trim());
      showToast({ type: 'success', message: t('app.success', 'Summary generated!') });
    } catch (e) {
      console.error(e);
      showToast({ type: 'error', message: t('errors.aiUnavailable') || 'Failed to summarize journal' });
    } finally {
      setIsSummarizing(false);
    }
  };

  const generatePost = async () => {
    if (!currentTripId) return;
    setIsGenerating(true);
    try {
      const places = days.flatMap(d => d.items.filter(i => i.type !== 'flight').map(i => i.text)).join(', ');
      const photosCtx = tripProfile?.photoAlbums?.length ? `Album Links: ${tripProfile.photoAlbums.join(', ')}` : '';
      
      const language = i18n.language === 'he' ? 'Hebrew' : 'English';
      const formattedJournal = entries.map(e => `[${new Date(e.createdAt).toLocaleString()}] ${e.authorName}: ${e.text} ${e.imageLink ? `(Image/Album: ${e.imageLink})` : ''}`).join('\n\n');
      const prompt = `Generate a beautifully formatted social media post about our trip. 
Length: ${postLength}.
Places visited: ${places}.
Personal notes/journal: ${formattedJournal}.
${photosCtx}
Include emojis, a warm tone, and mention our photos/videos. If image or album links are provided in the journal entries, you MUST integrate these specific links naturally into the post so that the images can be displayed.
Reply strictly in ${language} using markdown formatting. DO NOT output code blocks, just raw formatted text.`;

      const system = `You are an expert social media copywriter. Use the context of the trip: ${getUnifiedContext()}`;

      const reply = await callAI([{ role: 'user', text: prompt }], getProviderForTask('chat'), { systemInstruction: system, maxRetries: 1 });
      setGeneratedPost(reply.replace(/```markdown/g, '').replace(/```/g, '').trim());
    } catch (e) {
      console.error(e);
      showToast({ type: 'error', message: t('errors.aiUnavailable') || 'Failed to generate post' });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPost);
    showToast({ type: 'success', message: t('app.copied') || 'Copied to clipboard!' });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 flex items-center justify-center shadow-sm border border-brand-200 dark:border-brand-800">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('tabs.memories') || 'Memories & Journey'}
          </h1>
          <p className="text-sm text-slate-500">
            Document your experiences and generate beautiful posts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Journal & Photos */}
        <div className="space-y-6 flex flex-col h-full">
          <div className="card p-5 flex flex-col flex-1 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <PenTool size={18} className="text-brand-500" />
                Trip Journal
                {isSaving && <Loader2 size={14} className="animate-spin text-slate-400 ms-2" />}
              </h2>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs font-medium">
                <button 
                  onClick={() => setJournalMode('group')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${journalMode === 'group' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Users size={12} /> Group
                </button>
                <button 
                  onClick={() => setJournalMode('private')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${journalMode === 'private' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Lock size={12} /> Private
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pe-2 max-h-[350px]">
              {entries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No entries yet. Write your first thought!</p>
              ) : (
                entries.map(e => (
                  <div key={e.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-fade-in group">
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-600">{e.authorName}</span>
                        <span className="text-[10px] text-slate-400" dir="ltr">{new Date(e.createdAt).toLocaleString()}</span>
                      </div>
                      {(e.authorName === appUser?.name || journalMode === 'global') && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingId(e.id); setEditText(e.text); setEditImageLink(e.imageLink || ''); }} className="text-slate-400 hover:text-brand-500 transition-colors p-1">
                            <PenTool size={12} />
                          </button>
                          <button onClick={() => deleteEntry(e.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingId === e.id ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={editText}
                          onChange={(ev) => setEditText(ev.target.value)}
                          className="input-base w-full text-sm"
                          rows={3}
                          dir="auto"
                        />
                        <input
                          type="url"
                          value={editImageLink}
                          onChange={(ev) => setEditImageLink(ev.target.value)}
                          placeholder="Image or album URL (optional)"
                          className="input-base w-full text-sm"
                          dir="ltr"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-3">Cancel</button>
                          <button onClick={saveEditEntry} className="btn-primary text-xs py-1 px-3">Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{e.text}</p>
                        {e.imageLink && (
                          <div className="mt-2 w-32">
                            <AlbumPreview url={e.imageLink} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-auto flex flex-col gap-2 relative border-t border-slate-200 dark:border-slate-700 pt-4">
              <textarea
                value={newEntry}
                onChange={e => setNewEntry(e.target.value)}
                placeholder="Write down your thoughts, funny moments, or expenses..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-brand-500 resize-none shadow-sm"
                rows={3}
                dir="auto"
              />
              <input
                type="url"
                value={newImageLink}
                onChange={e => setNewImageLink(e.target.value)}
                placeholder="Image or album URL (optional)"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-brand-500 shadow-sm"
                dir="ltr"
              />
              <button 
                onClick={saveJournalEntry}
                disabled={!newEntry.trim() || isSaving}
                className="btn-primary py-2 px-4 self-end text-xs flex items-center gap-2 rounded-lg"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                Add Entry
              </button>
            </div>
          </div>

          <div className="card p-5 shadow-sm shrink-0">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <ImageIcon size={18} className="text-brand-500" />
              Photo Albums
            </h2>
            {tripProfile?.photoAlbums && tripProfile.photoAlbums.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {tripProfile.photoAlbums.map((url, idx) => (
                  <AlbumPreview key={idx} url={url} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                No albums added. Add Google Photos links in the Trip Settings.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: AI Generator & Visited Places */}
        <div className="space-y-6 flex flex-col">
          <div className="card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Sparkles size={18} className="text-brand-500" />
                AI Post Generator & Summary
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={summarizeJournal}
                  disabled={isSummarizing || entries.length === 0}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {isSummarizing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Summarize
                </button>
              </div>
            </div>
            
            <div className="space-y-4 mb-4">
              <select
                value={postLength}
                onChange={e => setPostLength(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-300 focus:border-brand-500 cursor-pointer"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </div>
            
            <button
              onClick={generatePost}
              disabled={isGenerating}
              className="w-full btn-primary py-3.5 flex justify-center items-center gap-2 mb-4 text-base shadow-md"
            >
              {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
              {isGenerating ? 'Generating Post...' : 'Generate Social Media Post'}
            </button>

            {generatedPost && (
              <div className="mt-6 relative group animate-fade-in">
                <div className="absolute -top-3 end-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={copyToClipboard} className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600 transition-colors">
                    <Copy size={16} />
                  </button>
                </div>
                <div 
                  className="bg-gradient-to-br from-brand-50 to-white dark:from-slate-900 dark:to-slate-950 border border-brand-200 dark:border-brand-800/50 rounded-xl p-5 text-sm md:text-base text-slate-800 dark:text-slate-200 whitespace-pre-wrap ai-chat-content min-w-0 break-words shadow-inner leading-relaxed"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  dir="auto"
                >
                  {generatedPost}
                </div>
              </div>
            )}
          </div>

          <div className="card p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-brand-500" />
              Places Visited
            </h2>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto hide-scrollbar">
              {days.flatMap(d => d.items.filter(i => i.type !== 'flight').map(i => (
                <span key={i.id} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 truncate max-w-full shadow-sm" dir="auto">
                  {i.text}
                </span>
              )))}
              {days.every(d => d.items.length === 0) && (
                <span className="text-sm text-slate-400">No places added to the itinerary yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
