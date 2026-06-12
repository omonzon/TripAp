import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getDoc, getDocs, doc, setDoc, updateDoc, collection, addDoc, deleteDoc, arrayUnion, onSnapshot, query } from 'firebase/firestore';
import {
  Settings, Key, Cpu, Moon, Sun, Globe, DollarSign, Cloud,
  Users, Eye, EyeOff, Bell, Download, Upload, CheckCircle2,
  Trash2, Plus, Loader2, Camera, Info, Mail, FileText, Table, AlertTriangle, Send, Sparkles, Search, Pen
} from 'lucide-react';
import { db } from '@/services/firebase';
import { deleteAllUserTrips } from '@/services/tripService';
import { useAuthStore, type AppUser } from '@/store/useAuthStore';
import { useTripStore, useUserRole, type TripProfile, type Participant } from '@/store/useTripStore';

interface OrphanedTrip {
  id: string;
  name: string;
  destinations: string[];
  participants: Participant[];
  pendingDeletionSince?: number;
}
import { useAIStore, type TaskType } from '@/store/useAIStore';
import { showToast } from '@/components/ui/Toast';
import { exportTripToFile, createFullBackup } from '@/services/backupService';
import { syncUserSettingsToCloud } from '@/services/authService';
import { exportTripToHTML, exportTripToPDF, exportTripToCSV } from '@/services/exportService';
import { fetchGeminiModels } from '@/services/ai';
import { TAB_DEFS } from '@/App';
import { compressImageToBase64 } from '@/utils/imageCompressor';
import { CloudRestoreModal } from '@/components/CloudRestoreModal';
import { AdminBugsManagement } from '@/components/admin/AdminBugsManagement';

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-pro', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro'] },
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'anthropic', label: 'Anthropic Claude', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'] },
  { id: 'ollama', label: '🖥️ Ollama (Local)', models: ['gemma2', 'llama3', 'mistral', 'phi3', 'qwen2'] },
] as const;

const LANGUAGES = [
  { code: 'en', label: 'English 🇺🇸' },
  { code: 'he', label: 'עברית 🇮🇱' },
  { code: 'fr', label: 'Français 🇫🇷' },
  { code: 'de', label: 'Deutsch 🇩🇪' },
  { code: 'es', label: 'Español 🇪🇸' },
  { code: 'nl', label: 'Nederlands 🇳🇱' },
] as const;

const TASK_LABELS: Record<TaskType, string> = {
  chat: 'Chat',
  itinerary: 'Itinerary Generation',
  extraction: 'Semantic Extraction',
  vision: 'Image Analysis',
  translation: 'Translation',
};

export default function SettingsView() {
  const { t } = useTranslation();
  const { appUser, isDarkMode, toggleDarkMode, language, setLanguage, autoBackupInterval, setAutoBackupInterval, emailjsConfig, setEmailjsConfig, setLastBackupTime } = useAuthStore();
  const { currentTripId, tripProfile, availableTrips, setTripProfile } = useTripStore();
  const {
    providerType, apiKey, models, localUrl, localModelName,
    setProvider, setApiKey, setModel, setLocalConfig,
  } = useAIStore();

  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);
  const [localUrlInput, setLocalUrlInput] = useState(localUrl);
  const [localModelInput, setLocalModelInput] = useState(localModelName);
  const [isValidating, setIsValidating] = useState(false);
  const [availableGeminiModels, setAvailableGeminiModels] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [saved, setSaved] = useState(false);

  // Bug reporting
  const [bugReport, setBugReport] = useState('');
  const [bugType, setBugType] = useState<'bug' | 'feature'>('bug');
  const [bugImage, setBugImage] = useState<string | null>(null);
  const [sendingBug, setSendingBug] = useState(false);
  const [bugSent, setBugSent] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [noAdminWarning, setNoAdminWarning] = useState(false);
  const [newUserRole, setNewUserRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [showEmailjsInfo, setShowEmailjsInfo] = useState(false);

  // Agent Commands
  const [agentRequest, setAgentRequest] = useState('');
  const [agentImage, setAgentImage] = useState<string | null>(null);
  const [agentCommands, setAgentCommands] = useState<any[]>([]);
  const [sendingAgentCommand, setSendingAgentCommand] = useState(false);
  const [agentListenInterval, setAgentListenInterval] = useState(10);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exportingType, setExportingType] = useState<'html' | 'pdf' | 'csv' | 'backup' | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);


  const [emailSaved, setEmailSaved] = useState(false);

  // Super Admin specific state
  const isSuperAdmin = appUser?.email?.toLowerCase().trim() === 'omonzon@gmail.com';
  const [affiliateLinks, setAffiliateLinks] = useState('{}');
  const [savingAffiliates, setSavingAffiliates] = useState(false);

  // User Management
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSortBy, setUserSortBy] = useState<'name' | 'email' | 'date'>('date');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [orphanedTrips, setOrphanedTrips] = useState<OrphanedTrip[]>([]);
  const [scanningOrphanedTrips, setScanningOrphanedTrips] = useState(false);

  const [showCloudRestore, setShowCloudRestore] = useState(false);
  const [showAdminBugs, setShowAdminBugs] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      const platformSnap = await getDoc(doc(db, 'platform_settings', 'global'));
      if (platformSnap.exists()) {
        const data = platformSnap.data();
        if (data.affiliateLinks) {
          setAffiliateLinks(JSON.stringify(data.affiliateLinks, null, 2));
        }
        if (data.agentListenInterval) {
          setAgentListenInterval(data.agentListenInterval);
        }
      }
    };
    fetchInitialData();
  }, [currentTripId]);

  const saveAffiliates = async () => {
    if (!appUser?.email) return;
    setSavingAffiliates(true);
    try {
      const parsed = JSON.parse(affiliateLinks);
      await setDoc(doc(db, 'platform_settings', 'global'), { affiliateLinks: parsed }, { merge: true });
      showToast({ type: 'success', message: 'Affiliate links saved!' });
    } catch (e) {
      showToast({ type: 'error', message: 'Invalid JSON format' });
    }
    setSavingAffiliates(false);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        setAllUsers(snap.docs.map(d => ({ email: d.id, ...d.data() } as AppUser)));
      } catch (e) {
        console.error('Failed to fetch users:', e);
      }
      setLoadingUsers(false);
    };
    fetchUsers();

    // Listen to agent commands
    const unsubAgent = onSnapshot(query(collection(db, 'agent_commands')), (snap: any) => {
      const cmds = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setAgentCommands(cmds);
    });

    return () => unsubAgent();
  }, [isSuperAdmin]);

  const saveAgentListenInterval = async () => {
    if (!appUser?.email) return;
    try {
      await setDoc(doc(db, 'platform_settings', 'global'), { agentListenInterval }, { merge: true });
      showToast({ type: 'success', message: 'Agent listen interval saved!' });
    } catch (e) {
      showToast({ type: 'error', message: 'Failed to save settings.' });
    }
  };

  const sendAgentCommand = async () => {
    if (!agentRequest.trim()) return;
    setSendingAgentCommand(true);
    try {
      const { Timestamp } = await import('firebase/firestore');
      const docRef = doc(collection(db, 'agent_commands'));
      await setDoc(docRef, {
        requestText: agentRequest.trim(),
        images: agentImage ? [agentImage] : [],
        status: 'pending',
        response: '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      // Removed localhost:54321 fetch since we now use Firebase listener
      setAgentRequest('');
      setAgentImage(null);
      showToast({ type: 'success', message: 'Agent command sent!' });
    } catch (e: any) {
      showToast({ type: 'error', message: 'Failed to send command: ' + e.message });
    }
    setSendingAgentCommand(false);
  };

  const deleteAgentCommand = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this command?')) return;
    try {
      await deleteDoc(doc(db, 'agent_commands', id));
      showToast({ type: 'success', message: 'Command deleted' });
    } catch (e) {
      showToast({ type: 'error', message: 'Failed to delete command' });
    }
  };

  const editAgentCommand = async (cmd: any) => {
    const newText = window.prompt('Edit command:', cmd.requestText);
    if (newText && newText !== cmd.requestText) {
      try {
        const { Timestamp } = await import('firebase/firestore');
        await updateDoc(doc(db, 'agent_commands', cmd.id), {
          requestText: newText,
          status: 'pending',
          updatedAt: Timestamp.now()
        });
        showToast({ type: 'success', message: 'Command updated & queued!' });
      } catch (e) {
        showToast({ type: 'error', message: 'Failed to update command' });
      }
    }
  };

  const handleBlockUser = async (email: string, currentBlocked: boolean) => {
    if (!isSuperAdmin || !confirm(`Are you sure you want to ${currentBlocked ? 'unblock' : 'block'} this user?`)) return;
    try {
      await updateDoc(doc(db, 'users', email), { isBlocked: !currentBlocked });
      setAllUsers(prev => prev.map(u => u.email === email ? { ...u, isBlocked: !currentBlocked } : u));
      showToast({ type: 'success', message: `User ${currentBlocked ? 'unblocked' : 'blocked'} successfully.` });
    } catch (e: any) {
      showToast({ type: 'error', message: `Failed to update user: ${e.message}` });
    }
  };

  const handleAdminDeleteUser = async (email: string) => {
    if (!isSuperAdmin || !confirm('Are you ABSOLUTELY sure you want to permanently delete this user? This cannot be undone.')) return;
    try {
      await deleteAllUserTrips(email);
      await deleteDoc(doc(db, 'users', email));
      setAllUsers(prev => prev.filter(u => u.email !== email));
      showToast({ type: 'success', message: 'User deleted successfully.' });
    } catch (e: any) {
      showToast({ type: 'error', message: `Failed to delete user: ${e.message}` });
    }
  };

  const scanOrphanedTrips = async () => {
    if (!isSuperAdmin) return;
    setScanningOrphanedTrips(true);
    try {
      // Get all unique trip IDs from all users
      const usersSnap = await getDocs(collection(db, 'users'));
      const tripIds = new Set<string>();
      usersSnap.docs.forEach(d => {
        const data = d.data();
        if (data.trips && Array.isArray(data.trips)) {
          data.trips.forEach((t: any) => tripIds.add(t.id));
        }
      });

      const orphaned: OrphanedTrip[] = [];
      for (const tripId of Array.from(tripIds)) {
        try {
          const profileSnap = await getDoc(doc(db, 'trips', tripId, 'profile', 'main'));
          if (profileSnap.exists()) {
            const data = profileSnap.data() as TripProfile;
            
            // Fetch participants from the subcollection
            const usersSnap = await getDocs(collection(db, 'trips', tripId, 'users'));
            const participants: Participant[] = [];
            let hasAdmin = false;
            
            usersSnap.forEach(d => {
              const pData = d.data() as Participant;
              if (pData.role === 'admin') hasAdmin = true;
              participants.push(pData);
            });
            
            if (!hasAdmin) {
              orphaned.push({
                id: tripId,
                name: data.name || 'Unknown Trip',
                destinations: data.destinations || [],
                participants,
                pendingDeletionSince: (data as any).pendingDeletionSince
              });
            }
          }
        } catch (err) {
          console.warn(`Failed to check trip ${tripId}:`, err);
        }
      }
      setOrphanedTrips(orphaned);
      showToast({ type: 'success', message: `Found ${orphaned.length} orphaned trips.` });
    } catch (e: any) {
      showToast({ type: 'error', message: `Failed to scan trips: ${e.message}` });
    }
    setScanningOrphanedTrips(false);
  };

  const sendOrphanedWarningEmail = async (trip: OrphanedTrip) => {
    try {
      if (trip.participants.length === 0) {
        showToast({ type: 'error', message: 'No participants to send warning to.' });
        return;
      }
      
      if (!emailjsConfig || !emailjsConfig.serviceId || !emailjsConfig.publicKey) {
        showToast({ type: 'error', message: 'Please configure EmailJS first.' });
        return;
      }
      
      const emailPromises = trip.participants.map(async p => {
        const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: emailjsConfig.serviceId,
            template_id: emailjsConfig.templateId || emailjsConfig.bugTemplateId,
            user_id: emailjsConfig.publicKey,
            template_params: {
              to_email: p.email,
              title: `התראת מחיקה: טיול ללא מנהל - ${trip.name}`,
              message: `שלום ${p.name || 'נוסע'},\n\nהטיול "${trip.name}" (${trip.destinations.join(', ')}) נותר ללא משתמש בעל הרשאות ניהול (Admin). \nעל פי נהלי המערכת, טיול יתום יימחק אוטומטית בעוד 14 יום.\n\nכדי לשמור את הטיול, אנא היכנס למערכת בקישור: https://trip-ap.vercel.app/\nבצע "ייצוא גיבוי" מההגדרות, ולאחר מכן תוכל לטעון אותו מחדש כטיול חדש שבו תהיה המנהל.\n\nצוות מערכת TripAp -`
            }
          })
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res;
      });
      
      await Promise.all(emailPromises);
      
      const pendingDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
      await updateDoc(doc(db, 'trips', trip.id, 'profile', 'main'), { pendingDeletionSince: pendingDate });
      
      setOrphanedTrips(prev => prev.map(t => t.id === trip.id ? { ...t, pendingDeletionSince: pendingDate } : t));
      showToast({ type: 'success', message: 'Warning email sent and deletion date scheduled.' });
    } catch (e: any) {
      console.error(e);
      showToast({ type: 'error', message: 'Failed to send email: ' + (e.text || e.message) });
    }
  };

  const deleteOrphanedTrip = async (tripId: string) => {
    if (!confirm('Are you sure you want to permanently delete this orphaned trip?')) return;
    try {
      const { deleteTripCompletely } = await import('@/services/tripService');
      await deleteTripCompletely(tripId);
      
      // Also remove it from the participants' users doc
      const trip = orphanedTrips.find(t => t.id === tripId);
      if (trip) {
        for (const p of trip.participants) {
          try {
            const userRef = doc(db, 'users', p.email);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              if (userData.trips) {
                const newTrips = userData.trips.filter((t: any) => t.id !== tripId);
                await updateDoc(userRef, { trips: newTrips });
              }
            }
          } catch (e) {
            console.warn(`Could not remove trip from user ${p.email}`, e);
          }
        }
      }
      
      setOrphanedTrips(prev => prev.filter(t => t.id !== tripId));
      showToast({ type: 'success', message: 'Orphaned trip deleted.' });
    } catch (e: any) {
      showToast({ type: 'error', message: 'Failed to delete trip: ' + e.message });
    }
  };

  const handleDeleteAccount = async () => {
    if (!appUser?.email) return;
    setDeletingAccount(true);
    try {
      const { auth } = await import('@/services/firebase');
      const currentUser = auth.currentUser;
      
      // Wipe all user data (trips they own, remove from trips they don't)
      await deleteAllUserTrips(appUser.email);

      await deleteDoc(doc(db, 'users', appUser.email));
      
      if (currentUser) {
        await currentUser.delete();
      }
      
      showToast({ type: 'success', message: 'Account deleted.' });
    } catch (error) {
      console.error(error);
      showToast({ type: 'error', message: 'Failed to delete account. You may need to sign out and sign in again before deleting.' });
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };

  const selectedProvider = PROVIDERS.find(p => p.id === providerType) ?? PROVIDERS[0];
  const userRole = useUserRole();
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    if (!currentTripId) return;
    const unsub = onSnapshot(collection(db, 'trips', currentTripId, 'users'), (snap) => {
      const arr: any[] = [];
      let hasAdmin = false;
      snap.forEach(d => {
        const data = d.data();
        if (data.role === 'admin') hasAdmin = true;
        arr.push(data);
      });
      setParticipants(arr as Participant[]);
      
      // Check if zero admins exist
      if (!hasAdmin && appUser && arr.some(p => p.email === appUser.email)) {
        setNoAdminWarning(true);
      } else {
        setNoAdminWarning(false);
      }
    });
    return () => unsub();
  }, [currentTripId, appUser]);

  const saveAISettings = async () => {
    if (providerType === 'gemini' && localKey.trim()) {
      setIsValidating(true);
      try {
        const fetchedModels = await fetchGeminiModels(localKey.trim());
        if (fetchedModels.length > 0) {
          setAvailableGeminiModels(fetchedModels);
          // If current models are not in the fetched list, fallback
          const tasks: TaskType[] = ['chat', 'itinerary', 'extraction', 'vision', 'translation'];
          tasks.forEach(task => {
            if (!fetchedModels.includes(models[task])) {
               setModel(task, fetchedModels.includes('gemini-1.5-flash') ? 'gemini-1.5-flash' : fetchedModels[0]);
            }
          });
        }
        showToast({ type: 'success', message: t('onboarding.keyValidated', 'API Key Validated!') });
      } catch (err) {
        showToast({ type: 'error', message: t('onboarding.keyInvalid', 'Invalid API Key.') });
        setIsValidating(false);
        return; // Don't save if invalid
      }
      setIsValidating(false);
    }
    setApiKey(localKey.trim());
    if (providerType === 'ollama') {
      setLocalConfig(localUrlInput, localModelInput);
    }
    
    // Use setTimeout to allow Zustand state to update before syncing
    setTimeout(() => {
      syncUserSettingsToCloud();
    }, 100);

    setSaved(true);
    showToast({ type: 'success', message: t('settings.saved') });
    setTimeout(() => setSaved(false), 3000);
  };

  const sendInviteEmail = async (email: string) => {
    const tripName = tripProfile?.name || 'הטיול שלנו';
    const inviterName = appUser?.name || appUser?.email?.split('@')[0] || '';
    const appLink = window.location.origin;
    
    const isHebrew = t('app.direction', 'rtl') === 'rtl';
    
    const subject = isHebrew 
      ? `הזמנה להצטרף לטיול "${tripName}"! ✈️` 
      : `You're invited to join the trip "${tripName}"! ✈️`;
      
    const body = isHebrew
      ? `היי!\n\n${inviterName} מזמין/ה אותך להצטרף לארגון הטיול "${tripName}" באפליקציית הטיולים שלנו.\nהגיע הזמן להתחיל לארוז (או לפחות להעמיד פנים שאנחנו מתכננים משהו)! 😉\n\nלחץ/י כאן כדי להתחבר לטיול:\n${appLink}\n\nנתראה שם!\n${inviterName}`
      : `Hey!\n\n${inviterName} invites you to join the planning for the trip "${tripName}" on our travel app.\nIt's time to start packing (or at least pretend we're planning something)! 😉\n\nClick here to join the trip:\n${appLink}\n\nSee you there!\n${inviterName}`;

    let emailSent = false;
    if (emailjsConfig?.serviceId && emailjsConfig?.inviteTemplateId && emailjsConfig?.publicKey) {
      try {
        const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: emailjsConfig.serviceId,
            template_id: emailjsConfig.inviteTemplateId,
            user_id: emailjsConfig.publicKey,
            template_params: {
              to_email: email,
              subject: subject,
              message: body,
              app_link: appLink,
              inviter_name: inviterName,
              trip_name: tripName
            }
          })
        });
        if (res.ok) {
          emailSent = true;
          showToast({ type: 'success', message: 'הזמנה נשלחה במייל (דרך EmailJS)!' });
        } else {
          console.error("EmailJS returned error:", await res.text());
        }
      } catch (e: any) {
        console.error("EmailJS failed to send invite:", e);
      }
    }

    if (!emailSent) {
      const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
    }
  };

  const addUser = async () => {
    if (!newUserEmail.trim() || !currentTripId) return;
    const cleanEmail = newUserEmail.trim().toLowerCase();
    
    if (appUser && cleanEmail === appUser.email.toLowerCase()) {
      showToast({ type: 'error', message: 'אינך יכול להזמין את עצמך' });
      return;
    }

    setAddingUser(true);
    let successCount = 0;

    try {
      await setDoc(doc(db, 'trips', currentTripId, 'users', cleanEmail), {
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: newUserRole,
      });
      console.log("Successfully wrote to trips/users subcollection");
      successCount++;
    } catch (e: any) {
      console.error("Error writing to trips/users subcollection:", e);
      showToast({ type: 'error', message: 'Permission error adding to trip: ' + e.message });
    }

    if (successCount > 0) {
      await sendInviteEmail(cleanEmail);
      setNewUserEmail('');
      showToast({ type: 'success', message: t('settings.userAdded') });
    }
    
    setAddingUser(false);
  };

  const updateParticipant = async (email: string, data: any) => {
    if (!currentTripId) return;
    
    // Prevent removing the last admin
    if (data.role && data.role !== 'admin') {
      const currentP = participants.find(p => p.email === email);
      if (currentP?.role === 'admin') {
        const adminCount = participants.filter(p => p.role === 'admin').length;
        if (adminCount <= 1) {
          showToast({ type: 'error', message: 'חובה שיהיה לפחות מנהל אחד בטיול. לא ניתן לשנות את הרשאת המנהל היחיד.' });
          return;
        }
      }
    }

    try {
      await setDoc(doc(db, 'trips', currentTripId, 'users', email), data, { merge: true });
    } catch (e) {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const removeParticipant = async (email: string) => {
    if (!currentTripId || !isAdmin) return;
    
    // Prevent removing the last admin
    const currentP = participants.find(p => p.email === email);
    if (currentP?.role === 'admin') {
      const adminCount = participants.filter(p => p.role === 'admin').length;
      if (adminCount <= 1) {
        showToast({ type: 'error', message: 'חובה שיהיה לפחות מנהל אחד בטיול. לא ניתן למחוק את המנהל היחיד.' });
        return;
      }
    }

    if (confirm(t('settings.confirmRemoveUser', 'האם אתה בטוח שברצונך להסיר משתמש זה מהטיול?'))) {
      try {
        await deleteDoc(doc(db, 'trips', currentTripId, 'users', email));
        showToast({ type: 'success', message: t('settings.userRemoved', 'המשתמש הוסר בהצלחה') });
      } catch (err) {
        showToast({ type: 'error', message: t('errors.general', 'אירעה שגיאה') });
      }
    }
  };

  const exportBackup = () => {
    const data = {
      tripProfile,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ type: 'success', message: t('settings.backupExported') });
  };

  const handleExportTrip = async () => {
    if (!currentTripId) return;
    setExportingType('backup');
    try {
      await exportTripToFile(currentTripId);
      showToast({ type: 'success', message: t('settings.tripExported', 'Trip exported successfully') });
    } catch {
      showToast({ type: 'error', message: t('app.error', 'An error occurred') });
    } finally {
      setExportingType(null);
    }
  };

  const handleDataExport = async (type: 'html' | 'pdf' | 'csv') => {
    if (!currentTripId) return;
    setExportingType(type);
    try {
      if (type === 'html') await exportTripToHTML(currentTripId);
      if (type === 'pdf') await exportTripToPDF(currentTripId);
      if (type === 'csv') await exportTripToCSV(currentTripId);
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: t('app.error', 'An error occurred') });
    } finally {
      setExportingType(null);
    }
  };

  const getFunnyMessage = () => {
    switch(exportingType) {
      case 'html': return 'אורזים לך את המזוודות לתוך דף אינטרנט... עוד רגע! 🧳';
      case 'pdf': return 'מכינים לך את הטיול להדפסה (מבטיחים לשמור על העצים)... 🌳';
      case 'csv': return 'דוחסים את כל ההוצאות לשורות של אקסל... תחזיקו חזק! 📊';
      case 'backup': return 'מגבים את כל הטיול למקום בטוח... מותחים שרירים! 💪';
      default: return '';
    }
  };

  const deleteCurrentTrip = async () => {
    if (!currentTripId) {
      showToast({ type: 'error', message: 'No active trip to delete' });
      return;
    }
    if (!appUser) {
      showToast({ type: 'error', message: 'User not found' });
      return;
    }

    try {
      showToast({ type: 'info', message: 'Deleting trip...' });
      await deleteDoc(doc(db, 'trips', currentTripId, 'profile', 'main'));
      
      const updatedTrips = availableTrips.filter(t => t.id !== currentTripId);
      await updateDoc(doc(db, 'users', appUser.email), {
        trips: updatedTrips
      }).catch(e => console.warn('Failed to update users doc', e));
      
      await updateDoc(doc(db, 'users', appUser.email, 'settings', 'app'), {
        activeTripId: null
      }).catch(e => console.warn('Failed to update settings doc', e));

      useTripStore.getState().setCurrentTrip(null);
      showToast({ type: 'success', message: t('settings.tripDeleted', 'Trip deleted successfully') });
    } catch (err: any) {
      console.error('Delete trip error:', err);
      showToast({ type: 'error', message: err.message || t('app.error') });
    }
  };

  const handleReportBug = async () => {
    if (!bugReport.trim() || !appUser) return;
    setSendingBug(true);
    try {
      await addDoc(collection(db, 'bugs'), {
        userId: appUser.email,
        text: bugReport.trim(),
        type: bugType,
        image: bugImage,
        createdAt: new Date(),
        userName: appUser.name,
        userAgent: navigator.userAgent,
        currentTripId,
        timestamp: Date.now(),
        date: new Date().toISOString()
      });

      if (emailjsConfig?.serviceId && (emailjsConfig?.bugTemplateId || emailjsConfig?.templateId) && emailjsConfig?.publicKey) {
        try {
          await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: emailjsConfig.serviceId,
              template_id: emailjsConfig.bugTemplateId || emailjsConfig.templateId,
              user_id: emailjsConfig.publicKey,
              template_params: {
                title: 'Bug Report',
                message: `Bug Report from ${appUser.name} (${appUser.email}):\n\n${bugReport.trim()}\n\nTrip ID: ${currentTripId}\nUser Agent: ${navigator.userAgent}`,
                to_email: 'omonzon@gmail.com'
              }
            })
          });
        } catch (emailErr) {
          console.error('Failed to send bug report via EmailJS', emailErr);
        }
      }

      setBugSent(true);
      setBugReport('');
      setBugImage(null);
      showToast({ type: 'success', message: 'תודה! הדיווח נשלח בהצלחה.' });
      setTimeout(() => setBugSent(false), 5000);
    } catch (e) {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setSendingBug(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Settings size={22} className="text-brand-500" />
        {t('settings.title')}
      </h2>

      {/* ── User Management (Admin only) ────────────────────────────────── */}
      {isAdmin && (
        <section className="card p-5 space-y-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-brand-500" />
            {t('settings.userManagement')}
            <span className="text-xs font-normal text-slate-500 ms-auto">{tripProfile?.name}</span>
          </h3>
          <div className="space-y-2">
            <input
              id="add-user-email"
              type="email"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              placeholder="user@email.com"
              className="input-base w-full text-sm"
              dir="ltr"
            />
            <div className="flex gap-2">
              <select
                value={newUserRole}
                onChange={e => setNewUserRole(e.target.value as any)}
                className="input-base text-sm flex-1"
              >
                <option value="viewer">{t('settings.roleViewer', 'Viewer')}</option>
                <option value="editor">{t('settings.roleEditor', 'Editor')}</option>
                <option value="admin">{t('settings.roleAdmin', 'Admin')}</option>
              </select>
              <button
                id="btn-add-user"
                onClick={addUser}
                disabled={addingUser || !newUserEmail.trim()}
                className="btn-primary flex items-center justify-center gap-2 px-6 shrink-0"
              >
                {addingUser ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {t('settings.addUser')}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">{t('settings.addUserHelp')}</p>
          
          {/* List of participants */}
          <div className="space-y-3 mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Trip Participants</h4>
            {participants.map(p => (
              <div key={p.email} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 sm:p-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-300 flex items-center justify-center font-bold text-sm shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{p.name}</div>
                        <input
                          type="text"
                          value={p.nickname || ''}
                          onChange={(e) => updateParticipant(p.email, { nickname: e.target.value })}
                          placeholder={t('settings.nickname', 'Nickname')}
                          className="input-base text-xs py-0.5 px-2 h-6 w-full sm:w-28 shrink-0"
                        />
                      </div>
                      <div className="text-xs text-slate-500 truncate" dir="ltr">{p.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <select 
                      value={p.role}
                      onChange={(e) => updateParticipant(p.email, { role: e.target.value })}
                      className="input-base text-xs py-1 px-2 shrink-0 w-full sm:w-auto"
                    >
                      <option value="viewer">{t('settings.roleViewer', 'Viewer')}</option>
                      <option value="editor">{t('settings.roleEditor', 'Editor')}</option>
                      <option value="admin">{t('settings.roleAdmin', 'Admin')}</option>
                    </select>
                    {isAdmin && p.email !== appUser?.email && (
                      <>
                        <button 
                          onClick={() => sendInviteEmail(p.email)}
                          className="text-brand-500 hover:text-brand-600 p-1.5 rounded hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors shrink-0 border border-transparent hover:border-brand-200 dark:hover:border-brand-800"
                          title={t('settings.resendInvite', 'שלח הזמנה מחדש')}
                        >
                          <Mail size={16} />
                        </button>
                        <button 
                          onClick={() => removeParticipant(p.email)}
                          className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0 border border-transparent hover:border-red-200 dark:hover:border-red-800"
                          title={t('settings.removeUser', 'הסר משתמש')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                {p.role !== 'admin' && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Visible Tabs</div>
                    <div className="flex flex-wrap gap-2">
                      {TAB_DEFS.map(tab => {
                        const isVisible = p.allowedTabs?.[tab.id] !== false;
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => updateParticipant(p.email, { 
                              allowedTabs: { ...(p.allowedTabs || {}), [tab.id]: !isVisible } 
                            })}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              isVisible 
                                ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-300' 
                                : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                            }`}
                          >
                            <Icon size={12} className={isVisible ? 'text-brand-500' : 'text-slate-400'} />
                            <span>{t(tab.labelKey)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── AI Provider ────────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Cpu size={18} className="text-brand-500" />
          {t('settings.aiProvider')}
        </h3>

        {/* Provider tabs */}
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              id={`provider-${p.id}`}
              onClick={() => setProvider(p.id as typeof providerType)}
              className={`py-2.5 px-3 rounded-xl text-sm font-medium text-start border-2 transition-all ${
                providerType === p.id
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* API Key (not for Ollama) */}
        {providerType !== 'ollama' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              <Key size={13} className="inline me-1" />
              {t('settings.apiKey')}
            </label>
            <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={e => setLocalKey(e.target.value)}
                placeholder="sk-... or AIza..."
                className="flex-1 py-2.5 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none font-mono"
              />
              <button onClick={() => setShowKey(s => !s)} className="text-slate-400 hover:text-slate-600 p-1">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">{t('settings.apiKeyHelp')}</p>
            <div className="text-xs text-brand-600 dark:text-brand-400 mt-2 flex gap-3">
              {providerType === 'gemini' && <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="hover:underline">{t('settings.getGeminiKey', 'Get Google Gemini API Key')}</a>}
              {providerType === 'openai' && <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="hover:underline">{t('settings.getOpenAIKey', 'Get OpenAI API Key')}</a>}
              {providerType === 'anthropic' && <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="hover:underline">{t('settings.getAnthropicKey', 'Get Anthropic API Key')}</a>}
            </div>
          </div>
        )}

      {noAdminWarning && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 md:p-6 mb-8 text-slate-800 dark:text-slate-200 animate-fade-in shadow-sm">
          <div className="flex items-start gap-4">
            <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-full shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">אזהרה: אין מנהל לטיול זה!</h3>
              <p className="text-sm text-red-700 dark:text-red-400 mb-4 leading-relaxed">
                נראה שהסרת את עצמך מניהול הטיול, וכעת אין לאף אחד הרשאות ניהול (Admin). 
                מטעמי אבטחה (Firebase Rules), לא ניתן לשחזר את ההרשאות באופן אוטומטי.
                <br /><br />
                <strong>איך מתקנים את זה? עקוף את הבעיה כך:</strong><br/>
                1. גלול מטה במסך זה עד למקטע "גיבוי ושחזור".<br/>
                2. לחץ על כפתור "ייצוא גיבוי (קובץ JSON)" ושמור את הקובץ.<br/>
                3. פתח את תפריט הטיולים למעלה ולחץ על "שחזור גיבוי (JSON)".<br/>
                4. בחר את הקובץ ששמרת הרגע. המערכת תיצור העתק מדויק של הטיול, ואתה תהיה המנהל שלו!
              </p>
            </div>
          </div>
        </div>
      )}

        {/* Ollama local config */}
        {providerType === 'ollama' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.localUrl')}</label>
              <input id="ollama-url" value={localUrlInput} onChange={e => setLocalUrlInput(e.target.value)} className="input-base font-mono text-sm" placeholder="http://127.0.0.1:11434/api/generate" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.localModel')}</label>
              <select id="ollama-model" value={localModelInput} onChange={e => setLocalModelInput(e.target.value)} className="input-base">
                {selectedProvider.models.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Per-task model selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('settings.modelPerTask')}</label>
          <div className="space-y-2">
            {(Object.keys(TASK_LABELS) as TaskType[]).map(task => {
              const dropdownOptions = providerType === 'gemini' && availableGeminiModels.length > 0 
                ? availableGeminiModels 
                : selectedProvider.models;
              return (
                <div key={task} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-32 shrink-0">{TASK_LABELS[task]}</span>
                  <select
                    id={`model-${task}`}
                    value={models[task]}
                    onChange={e => setModel(task, e.target.value)}
                    className="input-base text-sm py-1.5 flex-1"
                    disabled={providerType === 'ollama'}
                  >
                    {dropdownOptions.map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <button
          id="btn-save-ai"
          onClick={saveAISettings}
          disabled={isValidating}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isValidating ? <Loader2 size={16} className="animate-spin text-white" /> : saved ? <CheckCircle2 size={16} className="text-white" /> : <Key size={16} />}
          {isValidating ? t('onboarding.validateKey', 'Validate') : saved ? t('settings.saved') : t('app.save')}
        </button>
      </section>

      {/* ── Super Admin: User Management ─────────────────────────────────── */}
      {isSuperAdmin && (
        <section className="card p-5 space-y-4 border-2 border-brand-500/50">
          <h3 className="font-bold text-brand-700 dark:text-brand-400 flex items-center gap-2">
            <Users size={18} />
            User Management (Admin Only)
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text"
              placeholder="Search by name or email..."
              value={userSearchTerm}
              onChange={e => setUserSearchTerm(e.target.value)}
              className="input-base text-sm flex-1"
            />
            <select 
              value={userSortBy}
              onChange={e => setUserSortBy(e.target.value as any)}
              className="input-base text-sm w-full sm:w-40"
            >
              <option value="date">Join Date</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-800 dark:text-slate-400 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Joined</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr><td colSpan={5} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-brand-500" /></td></tr>
                ) : (
                  [...allUsers]
                    .filter(u => u.email?.toLowerCase().trim() !== 'omonzon@gmail.com')
                    .filter(u => 
                      (u.name || '').toLowerCase().includes(userSearchTerm.toLowerCase()) || 
                      (u.email || '').toLowerCase().includes(userSearchTerm.toLowerCase())
                    )
                    .sort((a, b) => {
                      if (userSortBy === 'name') return (a.name || '').localeCompare(b.name || '');
                      if (userSortBy === 'email') return (a.email || '').localeCompare(b.email || '');
                      return (b.createdAt || 0) - (a.createdAt || 0); // Date desc
                    })
                    .map(u => (
                      <tr key={u.email || Math.random().toString()} className="bg-white border-b dark:bg-slate-900 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                          {u.photoURL ? <img src={u.photoURL} alt={u.name || 'User'} className="w-6 h-6 rounded-full" /> : <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{(u.name || u.email || '?').charAt(0).toUpperCase()}</div>}
                          {u.name || 'No Name'}
                        </td>
                        <td className="px-4 py-3">{u.email || 'No Email'}</td>
                        <td className="px-4 py-3">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-3">
                          {u.isBlocked ? (
                            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-red-900 dark:text-red-300">Blocked</span>
                          ) : (
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleBlockUser(u.email, !!u.isBlocked)}
                            className={`p-1.5 rounded transition-colors ${u.isBlocked ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50'}`}
                            title={u.isBlocked ? 'Unblock User' : 'Block User'}
                          >
                            {u.isBlocked ? <CheckCircle2 size={16} /> : <EyeOff size={16} />}
                          </button>
                          <button 
                            onClick={() => handleAdminDeleteUser(u.email)}
                            className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors dark:bg-red-900/30 dark:hover:bg-red-900/50"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Orphaned Trips Management (Super Admin only) ──────────────── */}
      {isSuperAdmin && (
        <section className="card p-5 space-y-4 border-2 border-red-500">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle size={18} />
              Super Admin: ניהול טיולים יתומים
            </h3>
            <button
              onClick={scanOrphanedTrips}
              disabled={scanningOrphanedTrips}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {scanningOrphanedTrips ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              סרוק טיולים יתומים
            </button>
          </div>
          <p className="text-xs text-slate-500">
            טיולים ללא משתמש בהרשאת ניהול (Admin). ניתן למחוק אותם או לשלוח אזהרה למשתמשים.
          </p>

          {orphanedTrips.length > 0 && (
            <div className="overflow-x-auto mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm text-start text-slate-500 dark:text-slate-400">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-800/50 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Trip Name</th>
                    <th scope="col" className="px-4 py-3">Participants</th>
                    <th scope="col" className="px-4 py-3">Pending Deletion</th>
                    <th scope="col" className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanedTrips.map(trip => {
                    const isExpired = trip.pendingDeletionSince && Date.now() > trip.pendingDeletionSince;
                    return (
                      <tr key={trip.id} className={`border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isExpired ? 'bg-red-50 dark:bg-red-900/10' : 'bg-white dark:bg-slate-900'}`}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <div>{trip.name}</div>
                          <div className="text-xs text-slate-500">{trip.destinations.join(', ')}</div>
                        </td>
                        <td className="px-4 py-3">
                          {trip.participants.map(p => (
                            <div key={p.email} className="text-xs">{p.email} ({p.role})</div>
                          ))}
                        </td>
                        <td className="px-4 py-3">
                          {trip.pendingDeletionSince ? (
                            <span className={`text-xs font-medium px-2 py-1 rounded ${isExpired ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                              {new Date(trip.pendingDeletionSince).toLocaleDateString()}
                              {isExpired && ' (Expired)'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not Scheduled</span>
                          )}
                        </td>
                        <td className="px-4 py-3 flex items-center justify-center gap-2">
                          <button
                            onClick={() => sendOrphanedWarningEmail(trip)}
                            className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                            title="Send Warning Email (14 days)"
                          >
                            <Mail size={16} />
                          </button>
                          <button
                            onClick={() => deleteOrphanedTrip(trip.id)}
                            className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors dark:bg-red-900/30 dark:hover:bg-red-900/50"
                            title="Delete Trip Now"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── App Settings ───────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          {isDarkMode ? <Moon size={18} className="text-brand-400" /> : <Sun size={18} className="text-amber-500" />}
          {t('settings.theme')} & {t('settings.language')}
        </h3>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-slate-300">{isDarkMode ? t('settings.dark') : t('settings.light')} mode</span>
          <button
            id="btn-toggle-dark"
            onClick={toggleDarkMode}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isDarkMode ? 'bg-brand-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${isDarkMode ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            <Globe size={13} className="inline me-1" />
            {t('settings.language')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                id={`lang-${lang.code}`}
                onClick={() => setLanguage(lang.code as typeof language)}
                className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  language === lang.code
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Admin Bugs Management (Super Admin only) ────────────────────────── */}
      {isSuperAdmin && (
        <section className="card p-5 space-y-4 border-2 border-amber-500">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Super Admin: Bug Reports & Ideas
          </h3>
          <p className="text-xs text-slate-500">Manage all bug reports, view screenshots, and send to AI agent.</p>
          <button
            onClick={() => setShowAdminBugs(true)}
            className="btn-primary w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 border-amber-600"
          >
            <AlertTriangle size={16} />
            ניהול באגים והצעות לשיפור 🐞
          </button>
        </section>
      )}

      {showAdminBugs && <AdminBugsManagement onClose={() => setShowAdminBugs(false)} />}

      {/* ── Affiliate Links (Super Admin only) ────────────────────────── */}
      {isSuperAdmin && (
        <section className="card p-5 space-y-4 border-2 border-brand-500">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Globe size={18} className="text-brand-500" />
            Super Admin: Global Affiliate Links
          </h3>
          <p className="text-xs text-slate-500">Define affiliate links in JSON format to be used globally by the AI.</p>
          <textarea
            value={affiliateLinks}
            onChange={(e) => setAffiliateLinks(e.target.value)}
            className="input-base w-full h-40 font-mono text-sm"
            dir="ltr"
            placeholder={`{\n  "Booking.com": "https://booking.com/?aid=123",\n  "RentalCars": "..."\n}`}
          />
          <button
            onClick={saveAffiliates}
            disabled={savingAffiliates}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {savingAffiliates ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Save Affiliate Links
          </button>
        </section>
      )}

      {/* ── AI Agent Remote Control (Super Admin only) ────────────────── */}
      {isSuperAdmin && (
        <section className="card p-5 space-y-4 border-2 border-purple-500">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2">
              <Sparkles size={18} />
              Super Admin: AI Agent Remote Control
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Send commands to the background AI Agent running in your local IDE.
          </p>

          <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800">
            <label className="text-sm font-medium text-purple-700 dark:text-purple-300 flex-1">
              Pause Listener if User Active (minutes):
            </label>
            <input 
              type="number" 
              value={agentListenInterval} 
              onChange={e => setAgentListenInterval(parseInt(e.target.value) || 10)}
              className="input-base w-20 text-center"
            />
            <button onClick={saveAgentListenInterval} className="btn-secondary whitespace-nowrap text-xs">
              Save
            </button>
          </div>

          <div className="space-y-3 pt-3 border-t border-purple-100 dark:border-purple-800/50">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">New Command</h4>
            <textarea
              value={agentRequest}
              onChange={(e) => setAgentRequest(e.target.value)}
              className="input-base w-full h-24"
              placeholder="e.g. Add a delete button to the expenses page..."
              dir="auto"
            />
            
            <div className="flex items-center gap-3">
              <label className="btn-secondary flex items-center gap-2 cursor-pointer flex-1 justify-center relative overflow-hidden">
                <Camera size={16} />
                <span className="text-xs">{agentImage ? 'Change Image' : 'Attach Screenshot'}</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const base64 = await compressImageToBase64(f, 800, 0.7);
                      setAgentImage(base64);
                    } catch (err) {
                      showToast({ type: 'error', message: 'Failed to compress image' });
                    }
                  }}
                />
                {agentImage && (
                  <div className="absolute inset-0 bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center opacity-80">
                    <CheckCircle2 size={16} className="text-brand-500" />
                  </div>
                )}
              </label>
              <button
                onClick={sendAgentCommand}
                disabled={sendingAgentCommand || !agentRequest.trim()}
                className="btn-primary flex items-center gap-2 justify-center flex-[2]"
              >
                {sendingAgentCommand ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send to Agent
              </button>
            </div>
            {agentImage && (
              <div className="relative inline-block mt-2">
                <img src={agentImage.startsWith('data:') ? agentImage : `data:image/jpeg;base64,${agentImage}`} alt="Attachment" className="h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                <button onClick={() => setAgentImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-purple-100 dark:border-purple-800/50 space-y-3">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Command History</h4>
            {agentCommands.length === 0 ? (
              <p className="text-xs text-slate-400">No agent commands yet.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {agentCommands.map((cmd) => (
                  <div key={cmd.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          cmd.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          cmd.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          cmd.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {cmd.status ? cmd.status.toUpperCase() : 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-slate-400">{cmd.createdAt?.toDate().toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                        <button onClick={() => editAgentCommand(cmd)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500" title="Edit Command">
                          <Pen size={14} />
                        </button>
                        <button onClick={() => deleteAgentCommand(cmd.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500" title="Delete Command">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-medium mb-1 line-clamp-2" dir="auto">{cmd.requestText}</p>
                    {cmd.images?.length > 0 && (
                      <img src={cmd.images[0].startsWith('data:') ? cmd.images[0] : `data:image/jpeg;base64,${cmd.images[0]}`} alt="Attached" className="h-10 object-cover rounded my-1 border" />
                    )}
                    {cmd.response && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-bold text-purple-600 dark:text-purple-400 mb-1 flex items-center gap-1">
                          <Sparkles size={12} /> Agent Response:
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap" dir="auto">{cmd.response}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}



      {/* ── Backup & Restore ─────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Download size={18} className="text-brand-500" />
          {t('settings.backup')}
        </h3>
        <div className="flex flex-col gap-3 mt-4">
          <button onClick={() => setShowCloudRestore(true)} className="btn-primary flex items-center gap-2 justify-center py-3">
            <Cloud className="w-5 h-5" /> 
            שחזר מגיבוי ענן (אוטומטי)
          </button>
          <div className="flex gap-3">
            <button id="btn-export-backup" onClick={exportBackup} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
              <Download size={16} /> {t('settings.exportBackup')}
            </button>
            <label className="btn-secondary flex items-center gap-2 flex-1 cursor-pointer justify-center">
            <Upload size={16} /> {t('settings.importBackup')}
            <input type="file" accept=".json" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = ev => {
                try {
                  const data = JSON.parse(ev.target?.result as string);
                  showToast({ type: 'info', message: t('settings.backupLoaded', { date: data.exportedAt?.split('T')[0] ?? 'unknown date' }) });
                } catch {
                  showToast({ type: 'error', message: t('settings.backupError') });
                }
              };
              reader.readAsText(f);
            }} />
          </label>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.autoBackup', 'Auto Backup Interval')}</label>
            <p className="text-xs text-slate-400">{t('settings.autoBackupHelp', 'Backups are stored safely in cloud storage')}</p>
          </div>
          <select 
            value={autoBackupInterval.toString()}
            onChange={async (e) => {
              const newVal = parseInt(e.target.value, 10);
              const isEnabling = autoBackupInterval === 0 && newVal > 0;
              setAutoBackupInterval(newVal);
              setTimeout(() => syncUserSettingsToCloud(), 100);

              if (isEnabling && currentTripId && appUser?.email && tripProfile?.name) {
                try {
                  showToast({ type: 'info', message: t('backup.creatingFirst', 'יוצר גיבוי ראשוני בענן...') });
                  await createFullBackup(currentTripId, appUser.email);
                  setLastBackupTime(Date.now());
                  showToast({ type: 'success', message: t('backup.firstCreated', 'גיבוי ראשוני נוצר בהצלחה!') });
                } catch(err) {
                  console.error(err);
                  showToast({ type: 'error', message: t('backup.firstFailed', 'שגיאה ביצירת גיבוי ראשוני') });
                }
              }
            }}
            className="input-base text-sm py-1.5 w-32"
          >
            <option value="0">{t('settings.disabled', 'Disabled')}</option>
            <option value="6">6 {t('settings.hours', 'Hours')}</option>
            <option value="12">12 {t('settings.hours', 'Hours')}</option>
            <option value="24">24 {t('settings.hours', 'Hours')}</option>
          </select>
        </div>
      </section>

      {/* ── Email Notification Settings ────────────────────────────────────────── */}
      {isSuperAdmin && (
      <section className="card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Mail size={18} className="text-brand-500" />
            {t('settings.emailService', 'Email Notifications Service (EmailJS)')}
          </h3>
          <button 
            onClick={() => setShowEmailjsInfo(!showEmailjsInfo)}
            className="text-slate-400 hover:text-brand-500 transition-colors p-1"
          >
            <Info size={18} />
          </button>
        </div>
        
        {showEmailjsInfo && (
          <div className="bg-brand-50 dark:bg-brand-900/30 p-3 rounded-xl border border-brand-100 dark:border-brand-800/50 text-sm text-slate-700 dark:text-slate-300">
            <p className="mb-2 font-medium">To enable automatic email reminders:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Sign up for free at <a href="https://www.emailjs.com/" target="_blank" rel="noreferrer" className="text-brand-600 underline">EmailJS.com</a></li>
              <li>Add a new Email Service (e.g. Gmail) and note the <b>Service ID</b></li>
              <li>Create an Email Template with variables <code className="bg-white dark:bg-black px-1 rounded">{"{{message}}"}</code> and note the <b>Template ID</b></li>
              <li>Go to Account -&gt; API Keys and note the <b>Public Key</b></li>
            </ol>
            <p className="mt-2 text-xs italic text-slate-500">If you don't configure this, reminders will only show as push notifications.</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Service ID</label>
            <input 
              type="text" 
              value={emailjsConfig?.serviceId || ''}
              onChange={e => setEmailjsConfig({ ...emailjsConfig, serviceId: e.target.value } as any)}
              className="input-base text-sm w-full"
              placeholder="e.g., service_gmail123"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tasks Template ID</label>
            <input 
              type="text" 
              value={emailjsConfig?.templateId || ''}
              onChange={e => setEmailjsConfig({ ...emailjsConfig, templateId: e.target.value } as any)}
              className="input-base text-sm w-full"
              placeholder="e.g., template_x7a2b"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bug Report Template ID (Optional)</label>
            <input 
              type="text" 
              value={emailjsConfig?.bugTemplateId || ''}
              onChange={e => setEmailjsConfig({ ...emailjsConfig, bugTemplateId: e.target.value } as any)}
              className="input-base text-sm w-full"
              placeholder="e.g., template_bug123"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Invite Template ID (Optional)</label>
            <input 
              type="text" 
              value={emailjsConfig?.inviteTemplateId || ''}
              onChange={e => setEmailjsConfig({ ...emailjsConfig, inviteTemplateId: e.target.value } as any)}
              className="input-base text-sm w-full"
              placeholder="e.g., template_inv123"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Public Key</label>
            <input 
              type="text" 
              value={emailjsConfig?.publicKey || ''}
              onChange={e => setEmailjsConfig({ ...emailjsConfig, publicKey: e.target.value } as any)}
              className="input-base text-sm w-full"
              placeholder="e.g., xxxxxxxxxx_xxxxx"
            />
          </div>
        </div>

        <button
          onClick={async () => {
            await syncUserSettingsToCloud();
            setEmailSaved(true);
            showToast({ type: 'success', message: t('settings.saved') });
            setTimeout(() => setEmailSaved(false), 3000);
          }}
          className="btn-primary w-full flex items-center justify-center gap-2 mt-3"
        >
          {emailSaved ? <CheckCircle2 size={16} className="text-white" /> : <Mail size={16} />}
          {emailSaved ? t('settings.saved') : t('app.save')}
        </button>
      </section>
      )}


      {/* ── Export Trip Data ───────────────────────────────────────────── */}
      {currentTripId && tripProfile && (
        <section className="card p-5 space-y-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Download size={18} className="text-brand-500" />
            {t('settings.exportData', 'Export Data (HTML, PDF, Excel)')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('settings.exportDataHelp', 'Export your trip itinerary, expenses, and tasks in your preferred format.')}
          </p>

          {exportingType && ['html', 'pdf', 'csv'].includes(exportingType) && (
            <div className="text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 p-3 rounded-lg text-center animate-pulse" dir="rtl">
              {getFunnyMessage()}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-2">
            <button 
              onClick={() => handleDataExport('html')} 
              disabled={!!exportingType}
              className="btn-secondary flex flex-col items-center justify-center gap-1 py-3 disabled:opacity-50"
            >
              <Globe size={20} className="text-blue-500" />
              <span className="text-xs font-medium">HTML Webpage</span>
            </button>
            <button 
              onClick={() => handleDataExport('pdf')} 
              disabled={!!exportingType}
              className="btn-secondary flex flex-col items-center justify-center gap-1 py-3 disabled:opacity-50"
            >
              <FileText size={20} className="text-red-500" />
              <span className="text-xs font-medium">Print / PDF</span>
            </button>
            <button 
              onClick={() => handleDataExport('csv')} 
              disabled={!!exportingType}
              className="btn-secondary flex flex-col items-center justify-center gap-1 py-3 disabled:opacity-50"
            >
              <Table size={20} className="text-green-500" />
              <span className="text-xs font-medium">Excel (CSV)</span>
            </button>
          </div>
        </section>
      )}

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      {isAdmin && currentTripId && (
        <div className="card p-6 border-red-200 dark:border-red-900/30 mb-8">
          <h2 className="text-lg font-bold text-red-500 mb-4 flex items-center justify-between">
            {t('settings.dangerZone', 'Danger Zone')} <Trash2 size={20} />
          </h2>
          <div className="space-y-3">
            {exportingType === 'backup' && (
              <div className="text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 p-3 rounded-lg text-center animate-pulse" dir="rtl">
                {getFunnyMessage()}
              </div>
            )}
            <button 
              onClick={handleExportTrip} 
              disabled={!!exportingType}
              className="w-full btn-secondary flex items-center justify-center gap-2 mb-2 disabled:opacity-50"
            >
              {t('settings.exportTrip', 'Export Trip to Backup File')}
            </button>
            {!showDeleteConfirm ? (
              <button 
                onClick={() => setShowDeleteConfirm(true)} 
                className="w-full btn-secondary text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 flex items-center justify-center gap-2"
              >
                {t('settings.deleteTrip', 'Delete Current Trip')} <Trash2 size={16} />
              </button>
            ) : (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center animate-fade-in">
                <p className="text-sm text-red-600 dark:text-red-400 font-bold mb-3">
                  {t('settings.confirmDeleteTrip', 'Are you sure you want to delete this trip? This action cannot be undone.')}
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {t('app.cancel', 'Cancel')}
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      deleteCurrentTrip();
                    }}
                    className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                  >
                    {t('app.confirm', 'Yes, Delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Danger Zone: Delete Account ──────────────────────────────────── */}
      <section className="card p-5 space-y-4 border-2 border-red-500/20">
        <h3 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle size={18} />
          {t('tabs.dangerZone', 'Danger Zone')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('tabs.deleteAccountDesc', 'This action will completely delete your account. It cannot be undone.')}
        </p>
        
        {!showDeleteAccountConfirm ? (
          <button 
            onClick={() => setShowDeleteAccountConfirm(true)} 
            className="w-full btn-secondary text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2"
          >
            {t('tabs.deleteAccount', 'Delete My Account Permanently')} <Trash2 size={16} />
          </button>
        ) : (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center animate-fade-in">
            <p className="text-sm text-red-600 dark:text-red-400 font-bold mb-3">
              {t('tabs.confirmDeleteAccountDesc', 'Are you absolutely sure you want to delete your account?')}
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowDeleteAccountConfirm(false)}
                disabled={deletingAccount}
                className="flex-1 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {t('app.cancel', 'Cancel')}
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {deletingAccount && <Loader2 size={14} className="animate-spin" />}
                {t('app.confirm', 'Yes, Delete')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Bug Reporting & Feedback ───────────────────────────────────── */}
      <section className="card p-5 space-y-4 border-2 border-amber-500/20">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          דיווח על באגים והצעות לשיפור
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          נתקלתם בבעיה? יש לכם רעיון איך לשפר? ספרו לנו! 
          <br/>
          <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">
            (שימו לב: אף מידע אישי או פרטים על הטיולים שלכם לא נשלחים בדיווח זה. נשלח רק התוכן שתכתבו ופרטים טכניים על הדפדפן).
          </span>
        </p>
        <div className="flex flex-col gap-2">
          <select 
            value={bugType} 
            onChange={(e) => setBugType(e.target.value as 'bug' | 'feature')}
            className="input-base w-full md:w-1/3 text-sm"
          >
            <option value="bug">דיווח על תלתה/באג 🐞</option>
            <option value="feature">הצעת ייעול / בקשת פיצ'ר 💡</option>
          </select>
          <textarea
            value={bugReport}
            onChange={(e) => setBugReport(e.target.value)}
          placeholder="מה קרה? באיזה מסך? מה חסר לך?"
          className="input-base w-full h-24 resize-none"
            dir="auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="btn-secondary flex items-center justify-center gap-2 cursor-pointer flex-1 py-3">
            <Camera size={16} className={bugImage ? 'text-brand-500' : ''} />
            <span className="text-sm font-medium">{bugImage ? 'שנה צילום' : 'צרף צילום מסך'}</span>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const base64 = await compressImageToBase64(f, 800, 0.7);
                  setBugImage(base64);
                } catch (err) {
                  showToast({ type: 'error', message: 'Failed to compress image' });
                }
              }}
            />
          </label>
          <button
            onClick={handleReportBug}
            disabled={!bugReport.trim() || sendingBug}
            className="btn-primary flex-[2] flex items-center justify-center gap-2 py-3"
          >
            {sendingBug ? <Loader2 size={16} className="animate-spin" /> : (bugSent ? <CheckCircle2 size={16} /> : <FileText size={16} />)}
            {bugSent ? 'נשלח בהצלחה' : 'שלח דיווח'}
          </button>
        </div>
        {bugImage && (
          <div className="relative inline-block mt-2">
            <img src={bugImage.startsWith('data:') ? bugImage : `data:image/jpeg;base64,${bugImage}`} alt="Attachment" className="h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
            <button onClick={() => setBugImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </section>

      {/* App version */}
      <p className="text-xs text-center text-slate-400 dark:text-slate-600 pb-2">
        TravelPlatform v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'} · {import.meta.env.VITE_FIREBASE_PROJECT_ID}
      </p>

      <CloudRestoreModal isOpen={showCloudRestore} onClose={() => setShowCloudRestore(false)} />
    </div>
  );
}
