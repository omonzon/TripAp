import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { Sparkles, MapPin, Image as ImageIcon, BookOpen, PenTool, Loader2, Link2, Share2, Copy, Lock, Users, FileText, Trash2, Plus, ExternalLink, User } from 'lucide-react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
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
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <p className="text-[10px] font-medium text-slate-500 truncate mr-2" dir="ltr">{url}</p>
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
  const { currentTripId, tripProfile, days, setTripProfile } = useTripStore();
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
  const [newAlbumUrl, setNewAlbumUrl] = useState('');

  const MAP_LOADING_PHRASES = [
    'רק לחיצה קטנה ואני מכין לך את המפה המדהימה...',
    'מחשב מסלול מחדש (סתם, מצייר מפה)...',
    'אוסף נקודות עניין...',
    'מחבר את כל הימים למסלול אחד...'
  ];

  const [mapLevel, setMapLevel] = useState<'full' | 'detailed' | 'cities' | 'countries'>('cities');
  const [mapDateStart, setMapDateStart] = useState<string>('');
  const [mapDateEnd, setMapDateEnd] = useState<string>('');
  const [isGeneratingMap, setIsGeneratingMap] = useState(false);
  const [mapPhraseIndex, setMapPhraseIndex] = useState(0);

  useEffect(() => {
    if (tripProfile && !mapDateStart && !mapDateEnd) {
      setMapDateStart(tripProfile.startDate);
      setMapDateEnd(tripProfile.endDate);
    }
  }, [tripProfile]);

  useEffect(() => {
    if (isGeneratingMap) {
      const i = setInterval(() => setMapPhraseIndex(p => (p + 1) % MAP_LOADING_PHRASES.length), 3000);
      return () => clearInterval(i);
    }
  }, [isGeneratingMap]);

  // Use generated map or fallback to destinations
  const mapUrl = tripProfile?.generatedMapUrl || React.useMemo(() => {
    const dests = tripProfile?.destinations || [];
    if (dests.length === 0) return null;
    
    // If only one destination, just search for it
    if (dests.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dests[0])}`;
    }
    
    // Route from first to last destination
    const origin = encodeURIComponent(dests[0]);
    const destination = encodeURIComponent(dests[dests.length - 1]);
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    
    // Add waypoints if there are any between start and end
    if (dests.length > 2) {
      const waypoints = dests.slice(1, -1).map(loc => encodeURIComponent(loc)).join('|');
      url += `&waypoints=${waypoints}`;
    }
    return url;
  }, [tripProfile?.destinations]);

  const generateSmartMap = async () => {
    if (!currentTripId || !tripProfile) return;
    setIsGeneratingMap(true);
    try {
      // Filter days
      const filteredDays = days.filter(d => {
        if (!mapDateStart && !mapDateEnd) return true;
        let ok = true;
        if (mapDateStart && d.isoDate < mapDateStart) ok = false;
        if (mapDateEnd && d.isoDate > mapDateEnd) ok = false;
        return ok;
      });

      const itemsText = filteredDays.map(d => 
        `Day ${d.date}: ` + d.items.filter(i => i.type !== 'flight').map(i => i.text).join(', ')
      ).join('\n');

      const system = `You are a helpful travel assistant. The user wants to generate a Google Maps route from their itinerary.
They requested the detail level: ${mapLevel} (full = every single stop, detailed = main stops, cities = only cities/towns, countries = only countries).
Extract a clean list of places in chronological order from the provided itinerary.
Remove all descriptions, times, activities, and extra notes.
Return ONLY a valid JSON array of strings representing the clean location names, e.g. ["Paris", "Lyon", "Marseille"]. Do not return anything else.`;

      const prompt = `Here is the itinerary:\n${itemsText}`;

      const reply = await callAI([{ role: 'user', text: prompt }], getProviderForTask('extraction'), { systemInstruction: system, isJson: true });
      const places = parseAIJson<string[]>(reply, []);

      if (!Array.isArray(places) || places.length === 0) {
        throw new Error('No places found');
      }

      // Limit to 10 waypoints max (12 points total) due to Google Maps URL limits
      const maxWaypoints = 10;
      const safePlaces = places.length > maxWaypoints + 2 
        ? [places[0], ...places.slice(1, -1).slice(0, maxWaypoints), places[places.length - 1]] 
        : places;

      let url = '';
      if (safePlaces.length === 1) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safePlaces[0])}`;
      } else {
        const origin = encodeURIComponent(safePlaces[0]);
        const destination = encodeURIComponent(safePlaces[safePlaces.length - 1]);
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (safePlaces.length > 2) {
          const waypoints = safePlaces.slice(1, -1).map(loc => encodeURIComponent(loc)).join('|');
          url += `&waypoints=${waypoints}`;
        }
      }

      await updateDoc(doc(db, 'trips', currentTripId, 'profile', 'main'), {
        generatedMapUrl: url
      });
      setTripProfile({ ...tripProfile, generatedMapUrl: url });
      showToast({ type: 'success', message: t('memories.mapGenerated', 'Map generated successfully!') });
    } catch (e) {
      console.error(e);
      showToast({ type: 'error', message: t('errors.mapGenerationFailed', 'Failed to generate map') });
    } finally {
      setIsGeneratingMap(false);
    }
  };

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

  const addAlbumUrl = async () => {
    if (!newAlbumUrl.trim() || !currentTripId) return;
    try {
      const albums = tripProfile?.photoAlbums || [];
      const newAlbums = [...albums, newAlbumUrl.trim()];
      await updateDoc(doc(db, 'trips', currentTripId, 'profile', 'main'), {
        photoAlbums: newAlbums
      });
      if (tripProfile) {
        setTripProfile({ ...tripProfile, photoAlbums: newAlbums });
      }
      setNewAlbumUrl('');
      showToast({ type: 'success', message: t('settings.albumAdded', 'Album added!') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const removeAlbumUrl = async (url: string) => {
    if (!currentTripId) return;
    try {
      const albums = (tripProfile?.photoAlbums || []).filter(u => u !== url);
      await updateDoc(doc(db, 'trips', currentTripId, 'profile', 'main'), {
        photoAlbums: albums
      });
      if (tripProfile) {
        setTripProfile({ ...tripProfile, photoAlbums: albums });
      }
    } catch {
      showToast({ type: 'error', message: t('app.error') });
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
ALWAYS add the exact sentence at the very end (if in Hebrew): "גם אני נהנתי מהאפליקציה בטיול שלי, מוזמנים גם: https://ai-trip-ap.web.app/". If in English: "I also enjoyed using the TravelPlatform app for my trip, try it out: https://ai-trip-ap.web.app/"
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
            {t('memories.subtitle', 'תעדו את החוויות שלכם וצרו פוסטים יפים')}
          </p>
        </div>
      </div>

      <div className="card p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MapPin size={18} className="text-brand-500" />
            {t('memories.tripMap', 'מפת המסלול שלנו')}
          </h2>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-5 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">רמת פירוט</label>
            <select
              value={mapLevel}
              onChange={e => setMapLevel(e.target.value as any)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="full">מלאה (כל העצירות)</option>
              <option value="detailed">מפורטת (עצירות מרכזיות)</option>
              <option value="cities">ערים בלבד (ברירת מחדל)</option>
              <option value="countries">מדינות בלבד</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">מתאריך</label>
            <input 
              type="date"
              value={mapDateStart}
              onChange={e => setMapDateStart(e.target.value)}
              min={tripProfile?.startDate}
              max={tripProfile?.endDate}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">עד תאריך</label>
            <input 
              type="date"
              value={mapDateEnd}
              onChange={e => setMapDateEnd(e.target.value)}
              min={mapDateStart || tripProfile?.startDate}
              max={tripProfile?.endDate}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={generateSmartMap}
              disabled={isGeneratingMap || !tripProfile || days.length === 0}
              className="w-full md:w-auto btn-primary py-2 px-6 shadow-md"
            >
              {isGeneratingMap ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'הכן מפה מותאמת'}
            </button>
          </div>
        </div>

        {isGeneratingMap ? (
           <div className="flex flex-col gap-3">
            <div className="h-40 md:h-48 w-full rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden relative group bg-slate-100 dark:bg-slate-800">
              <div className="absolute inset-0 opacity-20 dark:opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '30px 30px' }}></div>
              <div className="absolute inset-0 bg-gradient-to-r from-brand-600/30 to-brand-400/30 dark:from-brand-900/50 dark:to-brand-800/50 animate-pulse"></div>
              <div className="absolute inset-0 z-10 flex items-center justify-center flex-col text-slate-800 dark:text-slate-200 p-6 text-center">
                 <Loader2 size={32} className="animate-spin mb-4 text-brand-600 dark:text-brand-400" />
                 <h3 className="text-xl font-bold mb-1 transition-all" key={mapPhraseIndex}>{MAP_LOADING_PHRASES[mapPhraseIndex]}</h3>
              </div>
            </div>
           </div>
        ) : mapUrl ? (
          <div className="flex flex-col gap-3">
            <div className="h-40 md:h-48 w-full rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden relative group bg-slate-100 dark:bg-slate-800">
              {/* Abstract Map Background CSS Pattern */}
              <div className="absolute inset-0 opacity-20 dark:opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '30px 30px' }}></div>
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-brand-600/80 to-brand-400/70 dark:from-brand-900/80 dark:to-brand-800/70"></div>
              <a href={mapUrl} target="_blank" rel="noreferrer" className="absolute inset-0 z-10 flex items-center justify-center flex-col text-white p-6 text-center bg-black/0 hover:bg-black/10 transition-colors group-hover:cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3 shadow-lg transform transition-transform group-hover:-translate-y-1">
                  <MapPin size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-1">המפה מוכנה!</h3>
                <p className="text-brand-50 text-sm max-w-lg mx-auto mb-4">
                  נתיב המסלול חולץ בהצלחה לגוגל מפות
                </p>
                <span className="px-5 py-2 bg-white text-brand-700 font-bold rounded-full shadow-lg flex items-center gap-2 transform transition-all group-hover:scale-105">
                  פתח מפה <ExternalLink size={16} />
                </span>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 px-4 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-100 dark:border-brand-800/50">
             <MapPin size={32} className="mx-auto mb-3 text-brand-400 dark:text-brand-600 opacity-50" />
             <p className="text-slate-600 dark:text-slate-300 font-medium">
               רק לחיצה קטנה למעלה ואני מכין לך מפה מדהימה של המסלול! 🌍
             </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Journal & Photos */}
        <div className="space-y-6 flex flex-col h-full">
          <div className="card p-5 flex flex-col flex-1 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <PenTool size={18} className="text-brand-500" />
                {t('memories.tripJournal', 'יומן מסע')}
                {isSaving && <Loader2 size={14} className="animate-spin text-slate-400 ms-2" />}
              </h2>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs font-medium">
                <button 
                  onClick={() => setJournalMode('group')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${journalMode === 'group' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Users size={12} /> {t('memories.group', 'קבוצתי')}
                </button>
                <button 
                  onClick={() => setJournalMode('private')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${journalMode === 'private' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Lock size={12} /> {t('memories.private', 'פרטי')}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pe-2 max-h-[350px]">
              {entries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t('memories.noEntries', 'אין רשומות עדיין. כתבו משהו!')}</p>
              ) : (
                entries.map(e => (
                  <div key={e.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-fade-in group">
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-600">{e.authorName}</span>
                        <span className="text-[10px] text-slate-400" dir="ltr">{new Date(e.createdAt).toLocaleString()}</span>
                      </div>
                      {(e.authorName === appUser?.name || journalMode === 'group') && (
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
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-3">{t('app.cancel', 'ביטול')}</button>
                          <button onClick={saveEditEntry} className="btn-primary text-xs py-1 px-3">{t('app.save', 'שמור')}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {e.authorName && (
                          <div className="text-[10px] text-brand-500 font-medium mb-1.5 flex items-center gap-1">
                            {e.authorName === 'AI' ? <Sparkles size={10} /> : <User size={10} />}
                            {e.authorName}
                          </div>
                        )}
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
                placeholder={t('memories.journalPlaceholder', 'כתבו את המחשבות שלכם, רגעים מצחיקים, הוצאות...')}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-brand-500 resize-none shadow-sm"
                rows={3}
                dir="auto"
              />
              <input
                type="url"
                value={newImageLink}
                onChange={e => setNewImageLink(e.target.value)}
                placeholder={t('memories.imagePlaceholder', 'קישור לתמונה או אלבום (אופציונלי)')}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-brand-500 shadow-sm"
                dir="ltr"
              />
              <button 
                onClick={saveJournalEntry}
                disabled={!newEntry.trim() || isSaving}
                className="btn-primary py-2 px-4 self-end text-xs flex items-center gap-2 rounded-lg"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                {t('memories.addEntry', 'הוסף רשומה')}
              </button>
            </div>
          </div>

          <div className="card p-5 shadow-sm shrink-0">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <ImageIcon size={18} className="text-brand-500" />
              {t('memories.photoAlbums', 'אלבומי תמונות')}
            </h2>
            {tripProfile?.photoAlbums && tripProfile.photoAlbums.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {tripProfile.photoAlbums.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <AlbumPreview url={url} />
                    <button 
                      onClick={() => removeAlbumUrl(url)}
                      className="absolute top-1 right-1 p-1.5 bg-white/80 dark:bg-black/60 hover:bg-red-500 hover:text-white rounded-md text-slate-600 dark:text-slate-300 transition-colors z-10 backdrop-blur-sm shadow-sm"
                    >
                      <Trash2 size={16} className="text-red-500 hover:text-white" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 mb-4">
                {t('memories.noAlbums', 'לא נוספו אלבומים עדיין. הוסיפו קישורי Google Photos או תמונות אחרות.')}
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="url"
                value={newAlbumUrl}
                onChange={e => setNewAlbumUrl(e.target.value)}
                placeholder="https://photos.app.goo.gl/..."
                className="input-base flex-1 text-sm"
                dir="ltr"
              />
              <button
                onClick={addAlbumUrl}
                disabled={!newAlbumUrl.trim()}
                className="btn-primary flex items-center gap-2 shrink-0 px-4"
              >
                <Plus size={16} />
                {t('app.add', 'Add')}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: AI Generator & Visited Places */}
        <div className="space-y-6 flex flex-col">
          <div className="card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Sparkles size={18} className="text-brand-500" />
                {t('memories.aiPostGenerator', 'מחולל פוסטים AI')}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={summarizeJournal}
                  disabled={isSummarizing || entries.length === 0}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {isSummarizing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {t('memories.summarize', 'סכם לי')}
                </button>
              </div>
            </div>
            
            <div className="space-y-4 mb-4">
              <select
                value={postLength}
                onChange={e => setPostLength(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-300 focus:border-brand-500 cursor-pointer"
              >
                <option value="short">{t('memories.short', 'קצר')}</option>
                <option value="medium">{t('memories.medium', 'בינוני')}</option>
                <option value="long">{t('memories.long', 'ארוך')}</option>
              </select>
            </div>
            
            <button
              onClick={generatePost}
              disabled={isGenerating}
              className="w-full btn-primary py-3.5 flex justify-center items-center gap-2 mb-4 text-base shadow-md"
            >
              {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
              {isGenerating ? t('memories.generatingPost', 'מייצר פוסט...') : t('memories.generateSocialPost', 'צור פוסט לרשתות חברתיות')}
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
                  <div className="mt-4 pt-3 border-t border-brand-200/50 dark:border-slate-700/50 flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">נוצר באמצעות TripAp AI</span>
                    <img src="/logo.png" className="w-5 h-5 object-contain opacity-80" alt="TripAp" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-brand-500" />
              {t('memories.placesVisited', 'מקומות בהם ביקרנו')}
            </h2>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto hide-scrollbar">
              {days.flatMap(d => d.items.filter(i => i.type !== 'flight').map(i => (
                <span key={i.id} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 truncate max-w-full shadow-sm" dir="auto">
                  {i.text}
                </span>
              )))}
              {days.every(d => d.items.length === 0) && (
                <span className="text-sm text-slate-400">{t('memories.noPlaces', 'לא נוספו מקומות למסלול עדיין.')}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
