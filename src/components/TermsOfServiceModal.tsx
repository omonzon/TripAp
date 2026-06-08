import React from 'react';
import { X, ShieldAlert } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function TermsOfServiceModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-start pt-20 sm:pt-24 p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
              <ShieldAlert className="text-brand-600 dark:text-brand-400 w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">תנאי שימוש (Terms of Service)</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-600 dark:text-slate-300 text-sm leading-relaxed" dir="rtl">
          <p>
            ברוכים הבאים ל-TripAp. עצם השימוש באפליקציה מהווה את הסכמתכם המלאה לתנאים הבאים. אנא קראו אותם בקפידה.
          </p>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200">1. היעדר אחריות על נזקים ופגמים (הסרת חבות)</h3>
            <p>
              האפליקציה, התוכן, המידע, והשירותים הכלולים בה מסופקים "כפי שהם" ("As-Is") ו"ככל שזמינים" ("As-Available") ללא התחייבות, מצג או אחריות מכל סוג שהוא, בין מפורש ובין משתמע.
              מפתח האפליקציה או מי מטעמו אינו נושא בכל אחריות לנזק עקיף, ישיר, מיוחד, נלווה או תוצאתי מכל סוג שהוא שייגרם לך, לציודך או לצד שלישי כתוצאה משימוש באפליקציה.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200">2. אובדן נתונים ושגיאות</h3>
            <p>
              המערכת עשויה לחוות תקלות, שגיאות בממשק ה-AI, מחיקת נתונים פתאומית, או אי-דיוקים. איננו מתחייבים שכל הנתונים שיוזנו על ידכם ישמרו בצורה בטוחה או יהיו זמינים תמיד.
              אתם מוותרים בזאת על כל תביעה כנגד מפתח האפליקציה בגין כל אובדן נתונים מכל סוג (לרבות תמונות, מסלולים והוצאות), או נתונים שגויים שהופקו.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200">3. הסתמכות על מידע AI</h3>
            <p>
              שירותים מסוימים באפליקציה מסתמכים על מודלי בינה מלאכותית (כגון Google Gemini). מידע זה נוצר באופן אוטומטי, אינו נבדק על ידי גורם אנושי, ועשוי להכיל שגיאות קריטיות (הזיות, נתונים פיננסיים שגויים, תרגומים לא נכונים ועוד).
              האחריות לבדיקת אמיתות הנתונים המופקים (הוצאות כספיות, זמני טיסה, כתובות) מוטלת כולה עליך.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200">4. הסכמה לאי-תביעה</h3>
            <p>
              באישור תנאים אלו, אתה מאשר ומסכים כי לא תהיה לך כל זכות לתבוע את מפתח האפליקציה או כל גורם הקשור אליו, בשום ערכאה משפטית, בגין כל נזק (ישיר או עקיף), הפסד, חוסר נוחות או הוצאה שנגרמו כתוצאה מהשימוש באפליקציה, מתקלה, ממידע שגוי, מחשיפת נתונים או מאובדן נתונים.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
          <button onClick={onClose} className="btn-primary px-8">
            הבנתי וסגור
          </button>
        </div>
      </div>
    </div>
  );
}
