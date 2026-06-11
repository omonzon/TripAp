import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Cloud, RotateCcw, X, Loader2, Calendar } from 'lucide-react';
import { getCloudBackups, restoreFromCloudBackup, CloudBackup } from '@/services/backupService';
import { useAuthStore } from '@/store/useAuthStore';
import { showToast } from '@/components/ui/Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CloudRestoreModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.appUser);
  
  const [backups, setBackups] = useState<CloudBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.email) {
      loadBackups();
    }
  }, [isOpen, user?.email]);

  const loadBackups = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const data = await getCloudBackups(user.email);
      setBackups(data);
    } catch (e) {
      console.error("Failed to load backups", e);
      showToast({ type: 'error', message: 'שגיאה בטעינת הגיבויים' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!user?.email || !user?.name) return;
    
    if (!window.confirm("האם אתה בטוח שברצונך לשחזר גיבוי זה? (ייווצר עותק חדש של הטיול)")) return;

    setRestoringId(backupId);
    try {
      await restoreFromCloudBackup(backupId, user.email, user.name);
      showToast({ type: 'success', message: 'הטיול שוחזר בהצלחה כעותק חדש!' });
      onClose();
    } catch (e) {
      console.error("Failed to restore", e);
      showToast({ type: 'error', message: 'שגיאה בשחזור הטיול' });
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  // Group backups by tripId
  const grouped = backups.reduce((acc, b) => {
    if (!acc[b.tripId]) acc[b.tripId] = { name: b.tripName, items: [] };
    acc[b.tripId].items.push(b);
    return acc;
  }, {} as Record<string, { name: string, items: CloudBackup[] }>);

  const content = (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-xl" dir="rtl">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
              <Cloud className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">שחזור מגיבוי ענן</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Cloud className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">אין גיבויים זמינים</h3>
              <p className="text-gray-500 dark:text-gray-400">גיבויים אוטומטיים נוצרים בהתאם לתדירות שהגדרת במסך ההגדרות.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([tripId, group]) => (
                <div key={tripId} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4 pr-2 border-r-4 border-blue-500">{group.name}</h3>
                  <div className="space-y-3">
                    {group.items.map(b => (
                      <div key={b.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-lg">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {new Date(b.createdAt).toLocaleDateString('he-IL')}
                            </div>
                            <div className="text-sm text-gray-500">
                              {new Date(b.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRestore(b.id)}
                          disabled={restoringId !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium rounded-lg transition-colors"
                        >
                          {restoringId === b.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          <span>שחזר</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
