import React from 'react';
import { X, HelpCircle, User, Shield, Eye, Map, BookOpen, Settings, List, FileText, Camera, Link, MapPin, Receipt, MessageSquare, Briefcase, CheckSquare, Navigation, Languages, Image, Bot, Type } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUserRole } from '@/store/useTripStore';

interface HelpGuideModalProps {
  onClose: () => void;
}

export default function HelpGuideModal({ onClose }: HelpGuideModalProps) {
  const { t } = useTranslation();
  const role = useUserRole();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 bg-slate-900/60 backdrop-blur-md animate-fade-in overflow-y-auto" onClick={onClose} dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center">
              <HelpCircle size={24} />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-white">מדריך למשתמש</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                <Shield size={12} /> רמת הרשאות נוכחית: 
                <span className={`px-2 py-0.5 rounded-full ${
                  role === 'admin' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  role === 'editor' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {role === 'admin' ? 'מנהל (Admin)' : role === 'editor' ? 'עורך (Editor)' : 'צופה (Viewer)'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-8 text-slate-700 dark:text-slate-300">
          
          <section>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <List className="text-brand-500" size={20} /> המסכים הראשיים
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><MapPin size={16} className="text-blue-500"/> מסלול</h4>
                <p className="text-sm leading-relaxed">כאן מרוכז כל לוח הזמנים של הטיול, מחולק לימים. ניתן לראות טיסות, מלונות, העברות ואטרקציות.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><CheckSquare size={16} className="text-teal-500"/> משימות</h4>
                <p className="text-sm leading-relaxed">רשימת ציוד ומטלות לפני ובזמן הטיול (כמו ויזה, ביטוח, אריזה). ניתן לבקש התראות ולסמן V על מה שבוצע.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><FileText size={16} className="text-amber-500"/> מסמכים</h4>
                <p className="text-sm leading-relaxed">ארכיון של כל המסמכים שנסרקו, כרטיסי טיסה והזמנות מלון. שומר את הטקסט באופן שאינו תופס מקום וניתן לעריכה ויצירה ידנית.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Navigation size={16} className="text-indigo-500"/> מיקומים</h4>
                <p className="text-sm leading-relaxed">מראה את המיקום בזמן אמת של המשתתפים בטיול על גבי מפה, ומאפשר לבקש המלצות לאטרקציות ומקומות מעניינים בקרבת מקום.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Map size={16} className="text-green-500"/> מפה</h4>
                <p className="text-sm leading-relaxed">תצוגה גיאוגרפית של מסלול הטיול, הכוללת את כל הנקודות שצוינו בתיאורי הימים.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Receipt size={16} className="text-purple-500"/> הוצאות</h4>
                <p className="text-sm leading-relaxed">ניהול ומעקב אחר תקציב הטיול, חלוקת הוצאות בין חברים והצגת גרפים מסכמים.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><MessageSquare size={16} className="text-orange-500"/> צ'אט</h4>
                <p className="text-sm leading-relaxed">מרחב התייעצות קבוצתי בו כל השותפים לטיול יכולים לדבר ולהחליף חוויות.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Languages size={16} className="text-sky-500"/> תרגומים</h4>
                <p className="text-sm leading-relaxed">פיצ'ר שמאפשר תרגום מהיר של טקסטים או משפטים לשימוש שוטף במהלך הטיול.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Image size={16} className="text-rose-500"/> זיכרונות</h4>
                <p className="text-sm leading-relaxed">הוספת חוויות וקישורים לאלבומי תמונות. כל חברי הקבוצה יכולים להעלות ולשתף תמונות משותפות וליצור פוסט מדליק לפרסום.</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold mb-1 flex items-center gap-2"><Bot size={16} className="text-indigo-600"/> עוזר AI</h4>
                <p className="text-sm leading-relaxed">עוזר חכם המלווה את הטיול ומאפשר התייעצות, קבלת מידע, וגם בקשות לעדכון ושינוי אוטומטי של מסלול הטיול.</p>
              </div>
            </div>
          </section>

          {(role === 'admin' || role === 'editor') && (
            <section>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                <Briefcase className="text-brand-500" size={20} /> פעולות עריכה (הרשאות: עורך ומעלה)
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <Camera className="text-slate-400 mt-0.5 shrink-0" size={18} />
                  <div>
                    <h4 className="font-bold text-sm">סריקת מסמכים (Scan Doc)</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">ניתן להעלות צילומי מסך של כרטיסי טיסה, הזמנות מלון או קבצי PDF. בינה מלאכותית תקרא את המסמך ותשבץ את הפעילות ישירות ביום המתאים.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <Link className="text-slate-400 mt-0.5 shrink-0" size={18} />
                  <div>
                    <h4 className="font-bold text-sm">סריקת הפניות</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">סורק את כל פעילויות המסלול, ומוסיף להן קישורי הזמנה חכמים (למשל קישור ל-Google Flights או Booking.com) באופן אוטומטי.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <List className="text-slate-400 mt-0.5 shrink-0" size={18} />
                  <div>
                    <h4 className="font-bold text-sm">גרירה ושחרור (Drag & Drop)</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">במסך המסלול, ניתן לגרור כל פריט או להזיז ימים שלמים באמצעות תפיסה מכפתור "שש הנקודות" המופיע ליד כל פריט.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <Bot className="text-slate-400 mt-0.5 shrink-0" size={18} />
                  <div>
                    <h4 className="font-bold text-sm">עדכון המסלול בעזרת בינה מלאכותית</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">בתחתית מסך המסלול קיימת שורת פקודה לעוזר ה-AI. ניתן לבקש ממנו בשפה חופשית להוסיף, להסיר, או לשנות פריטים במסלול והוא יעדכן את לוח הזמנים באופן אוטומטי.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {role === 'admin' && (
            <section>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                <Shield className="text-brand-500" size={20} /> פעולות ניהול (הרשאות: מנהל בלבד)
              </h3>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800/50">
                <p className="text-sm leading-relaxed text-red-800 dark:text-red-300 mb-2">בתור מנהל הטיול, יש לך גישה למסך ה<Settings size={14} className="inline"/> הגדרות, שם תוכל:</p>
                <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-400 space-y-1">
                  <li>להזמין חברים לטיול ולנהל את ההרשאות שלהם (צופה, עורך).</li>
                  <li>לשנות את שם הטיול, התאריכים, והיעדים הראשיים.</li>
                  <li>למחוק את הטיול לחלוטין.</li>
                </ul>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <BookOpen className="text-brand-500" size={20} /> טיפים כלליים (לכל המשתמשים)
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-brand-500 mt-1">•</span> 
                <span>לחיצה על כפתור <b>(i)</b> ליד אתר במסלול תפתח מידע מורחב על המקום.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-500 mt-1">•</span> 
                <span>בתפריט הצידי ניתן ללחוץ על <b>הדפסה (Export to PDF)</b> כדי לייצר קובץ מסודר של המסלול המלא.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-500 mt-1">•</span> 
                <span>הסרגל העליון מאפשר מעבר למצב חשוך (<Moon size={12} className="inline" /> / <Sun size={12} className="inline" />), החלפת שפה (EN / עב), ושינוי גודל הגופן (<Type size={12} className="inline" />).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-500 mt-1">•</span> 
                <span>מעבר בין טיולים מתבצע דרך התפריט העליון. לכל טיול יש מסלול, הוצאות, משימות ותוכן משלו המופרדים לחלוטין מטיולים אחרים בחשבון.</span>
              </li>
            </ul>
          </section>

        </div>
        
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-end rounded-b-3xl">
          <button onClick={onClose} className="btn-primary py-2 px-6">
            הבנתי, תודה!
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Minimal icons for the tips section
const Moon = ({ size, className }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>;
const Sun = ({ size, className }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>;
