import React from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTripStore } from '@/store/useTripStore';

export const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const isOnline = useTripStore(s => s.isOnline);

  if (isOnline) return null;

  return (
    <div className="w-full bg-slate-800 dark:bg-slate-900 text-white p-2 text-center text-xs flex items-center justify-center gap-2 z-[60]">
      <WifiOff size={14} className="text-amber-400 shrink-0" />
      <span className="font-medium">
        {t('app.offlineMessage', 'You are offline. Changes are saved locally. AI features are disabled.')}
      </span>
    </div>
  );
};
