import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useTripStore } from '@/store/useTripStore';
import i18n from '@/i18n';

export async function getTripDataForExport(tripId: string) {
  const tripProfile = useTripStore.getState().tripProfile;
  if (!tripProfile || tripProfile.id !== tripId) {
    throw new Error("Trip profile not loaded or mismatch");
  }

  const collections = ['itinerary', 'tasks', 'expenses', 'journal', 'aiChats', 'documents'];
  const data: Record<string, any[]> = {};
  
  for (const coll of collections) {
    const snap = await getDocs(collection(db, 'trips', tripId, coll));
    data[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  return { 
    tripProfile,
    itinerary: data['itinerary'] || [],
    tasks: data['tasks'] || [],
    expenses: data['expenses'] || [],
    journal: data['journal'] || [],
    aiChats: data['aiChats'] || [],
    documents: data['documents'] || []
  };
}

async function generateHTML(tripId: string) {
  const { tripProfile, itinerary, tasks, expenses, journal, aiChats, documents } = await getTripDataForExport(tripId);
  
  // Sort itinerary by date/time
  itinerary.sort((a: any, b: any) => {
    if (a.isoDate && b.isoDate) return new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime();
    return (a.order || 0) - (b.order || 0);
  });
  
  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>ייצוא טיול: ${tripProfile.name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; line-height: 1.6; max-width: 100%; overflow-x: hidden; }
        h1 { color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        h2 { color: #4b5563; margin-top: 30px; page-break-after: avoid; }
        .section { margin-bottom: 40px; width: 100%; }
        table { width: 100%; max-width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
        th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: right; word-wrap: break-word; overflow-wrap: break-word; vertical-align: top; }
        th { background-color: #f9fafb; font-weight: 600; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 11px; background: #e0e7ff; color: #3730a3; word-break: keep-all; }
        @media print {
          @page { size: A4; margin: 15mm; }
          body { margin: 0; padding: 0; width: 100%; max-width: 100%; }
          button { display: none; }
          .page-break { page-break-after: always; }
          table { page-break-inside: auto; width: 100%; max-width: 100%; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td, th { padding: 6px; font-size: 11px; }
          h1, h2 { page-break-after: avoid; }
        }
      </style>
    </head>
    <body>
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://ai-trip-ap.web.app/logo.png" alt="TripAp" style="width: 80px; height: 80px; object-fit: contain;" />
      </div>
      <h1>טיול: ${tripProfile.name}</h1>
      <p><strong>יעדים:</strong> ${(tripProfile.destinations || []).join(', ')}</p>
      <p><strong>תאריכים:</strong> ${tripProfile.startDate} - ${tripProfile.endDate}</p>
      
      <div class="section">
        <h2>הגדרות טיול (Settings)</h2>
        <p><strong>תקציב:</strong> ${tripProfile.budget || 0} ${tripProfile.currency || ''}</p>
        <p><strong>קצב טיול:</strong> ${tripProfile.pace || ''}</p>
        <p><strong>העדפות והערות:</strong> ${tripProfile.preferences || 'אין'}</p>
        <p><strong>משתתפים:</strong> ${tripProfile.participants?.map((p: any) => p.name).join(', ') || ''}</p>
      </div>
      
      <div class="section">
        <h2>מסלול (Itinerary)</h2>
        <table>
          <tr><th style="width: 15%;">תאריך / יום</th><th style="width: 10%;">שעה</th><th style="width: 60%;">פעילות</th><th style="width: 15%;">סוג</th></tr>
          ${itinerary.map((day: any) => {
            const dayLabel = day.date || day.title || '';
            if (!day.items || day.items.length === 0) {
              return `<tr><td><strong>${dayLabel}</strong></td><td colspan="3" style="text-align: center; color: #9ca3af;">אין פעילויות ליום זה</td></tr>`;
            }
            return day.items.map((item: any, index: number) => `
              <tr>
                ${index === 0 ? `<td rowspan="${day.items.length}"><strong>${dayLabel}</strong></td>` : ''}
                <td style="direction: ltr; text-align: right;">
                  ${item.type === 'flight' && item.flightData?.time ? item.flightData.time : '-'}
                </td>
                <td>
                  ${item.text || ''}
                  ${item.type === 'flight' && item.flightData ? `<br/><small style="color: #6b7280; display: block; margin-top: 4px;">סטטוס: ${item.flightData.status || '-'} | שער: ${item.flightData.gate || '-'} | טרמינל: ${item.flightData.terminal || '-'}</small>` : ''}
                </td>
                <td><span class="badge">${item.type || 'activity'}</span></td>
              </tr>
            `).join('');
          }).join('')}
        </table>
      </div>

      <div class="page-break"></div>

      <div class="section">
        <h2>הוצאות (Expenses)</h2>
        <table>
          <tr><th style="width: 15%;">תאריך</th><th style="width: 50%;">תיאור</th><th style="width: 15%;">קטגוריה</th><th style="width: 20%;">סכום</th></tr>
          ${expenses.map((item: any) => `
            <tr>
              <td style="direction: ltr; text-align: right;">${(item.date || item.createdAt) ? new Date(item.date || item.createdAt).toLocaleDateString() : '-'}</td>
              <td>${item.description || ''}</td>
              <td><span class="badge">${item.category || ''}</span></td>
              <td style="direction: ltr; text-align: right; white-space: nowrap;">${item.amount || 0} ${item.currency || ''}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <div class="section">
        <h2>משימות (Tasks)</h2>
        <table>
          <tr><th style="width: 60%;">משימה</th><th style="width: 15%;">סטטוס</th><th style="width: 25%;">מוקצה ל</th></tr>
          ${tasks.length === 0 ? `<tr><td colspan="3" style="text-align:center;">אין משימות</td></tr>` : tasks.map((item: any) => `
            <tr>
              <td>${item.text || item.title || ''}</td>
              <td>${item.completed ? 'הושלם' : 'בתהליך'}</td>
              <td>${item.assignee || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <div class="section">
        <h2>מסמכים (Documents)</h2>
        <table>
          <tr><th style="width: 50%;">כותרת</th><th style="width: 20%;">מספר אסמכתא</th><th style="width: 30%;">הערות</th></tr>
          ${documents.length === 0 ? `<tr><td colspan="3" style="text-align:center;">אין מסמכים</td></tr>` : documents.map((doc: any) => `
            <tr>
              <td>${doc.title || ''}</td>
              <td style="direction: ltr; text-align: right;">${doc.referenceNumber || '-'}</td>
              <td>${doc.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <div class="page-break"></div>

      <div class="section">
        <h2>זיכרונות ויומן (Journal)</h2>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap;">
          ${journal.length === 0 ? 'אין רישומים ביומן.' : journal.map((doc: any) => {
            const title = doc.id === 'global' ? 'יומן קבוצתי' : 'יומן פרטי';
            let content = '';
            if (doc.entries && Array.isArray(doc.entries)) {
              content = doc.entries.map((e: any) => `[${new Date(e.createdAt).toLocaleString()}] ${e.authorName}:\n${e.text}`).join('\n\n');
            } else if (doc.text) {
              content = doc.text;
            }
            if (!content) return '';
            return `<h3>${title}</h3><p>${content}</p>`;
          }).join('<hr style="margin: 20px 0; border: 0; border-top: 1px solid #e2e8f0;" />')}
        </div>
      </div>

      <div class="section">
        <h2>שיחות AI (AI Chats)</h2>
        ${aiChats.length === 0 ? '<p>אין שיחות מוקלטות.</p>' : aiChats.map((chat: any) => `
          <div style="margin-bottom: 20px; border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; page-break-inside: avoid;">
            <h3 style="margin-top:0; color: #4338ca;">${chat.title || 'שיחה ללא כותרת'}</h3>
            <div style="font-size: 0.95em; color: #4b5563;">
              ${(chat.messages || []).map((msg: any) => `
                <p style="margin-bottom: 10px;"><strong>${msg.role === 'user' ? 'משתמש' : 'AI'}:</strong> <span style="white-space: pre-wrap;">${msg.text || msg.content || ''}</span></p>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="margin-top: 60px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
        <img src="https://ai-trip-ap.web.app/logo.png" alt="TripAp Logo" style="width: 32px; height: 32px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;" />
        <p style="margin: 0; font-weight: 500;">
          ${i18n.language === 'he' ? 'נוצר באהבה על ידי TripAp' : 'Created with love by TripAp'}
        </p>
        <a href="https://ai-trip-ap.web.app/" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13px;">https://ai-trip-ap.web.app/</a>
      </div>
    </body>
    </html>
  `;
  return html;
}

export async function exportTripToHTML(tripId: string) {
  const html = await generateHTML(tripId);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = useTripStore.getState().tripProfile?.name ?? 'Trip';
  a.download = `${name.replace(/[^a-z0-9א-ת]/gi, '_')}_Export.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportTripToPDF(tripId: string) {
  const html = await generateHTML(tripId);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }
}

export async function exportTripToCSV(tripId: string) {
  const { tripProfile, itinerary, expenses, tasks, journal, documents } = await getTripDataForExport(tripId);
  
  // Create Expenses CSV
  let expensesCsv = '\uFEFFתאריך,תיאור,קטגוריה,סכום,מטבע\\n';
  expenses.forEach((e: any) => {
    const date = (e.date || e.createdAt) ? new Date(e.date || e.createdAt).toLocaleDateString() : '';
    expensesCsv += `"${date}","${(e.description || '').replace(/"/g, '""')}","${e.category || ''}","${e.amount || 0}","${e.currency || ''}"\\n`;
  });
  
  // Sort itinerary by date/time
  itinerary.sort((a: any, b: any) => {
    if (a.isoDate && b.isoDate) return new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime();
    return (a.order || 0) - (b.order || 0);
  });

  // Create Itinerary CSV
  let itineraryCsv = '\uFEFFיום/תאריך,שעה,פעילות,סוג\\n';
  itinerary.forEach((day: any) => {
    const dayLabel = day.date || day.title || '';
    if (!day.items || day.items.length === 0) {
      itineraryCsv += `"${dayLabel.replace(/"/g, '""')}","","אין פעילויות",""\\n`;
      return;
    }
    day.items.forEach((item: any) => {
      const time = item.type === 'flight' && item.flightData?.time ? item.flightData.time : '';
      itineraryCsv += `"${dayLabel.replace(/"/g, '""')}","${time}","${(item.text || '').replace(/"/g, '""')}","${item.type || 'activity'}"\\n`;
    });
  });

  // Create Tasks CSV
  let tasksCsv = '\uFEFFמשימה,סטטוס,מוקצה ל\\n';
  tasks.forEach((t: any) => {
    tasksCsv += `"${(t.text || t.title || '').replace(/"/g, '""')}","${t.completed ? 'הושלם' : 'בתהליך'}","${(t.assignee || '').replace(/"/g, '""')}"\\n`;
  });

  // Create Documents CSV
  let documentsCsv = '\uFEFFכותרת,מספר אסמכתא,הערות\\n';
  documents.forEach((d: any) => {
    documentsCsv += `"${(d.title || '').replace(/"/g, '""')}","${(d.referenceNumber || '').replace(/"/g, '""')}","${(d.notes || '').replace(/"/g, '""')}"\\n`;
  });

  // Create Settings & Journal CSV
  let generalCsv = '\uFEFFסוג,תוכן\\n';
  generalCsv += `"שם הטיול","${(tripProfile.name || '').replace(/"/g, '""')}"\\n`;
  generalCsv += `"יעדים","${((tripProfile.destinations || []).join(', ')).replace(/"/g, '""')}"\\n`;
  generalCsv += `"תאריכים","${tripProfile.startDate} - ${tripProfile.endDate}"\\n`;
  generalCsv += `"תקציב","${tripProfile.budget} ${tripProfile.currency}"\\n`;
  generalCsv += `"העדפות","${(tripProfile.preferences || '').replace(/"/g, '""')}"\\n`;
  generalCsv += `"זיכרונות ויומן","${(journal[0]?.text || '').replace(/"/g, '""')}"\\n`;

  const name = tripProfile?.name ?? 'Trip';
  const prefix = name.replace(/[^a-z0-9א-ת]/gi, '_');

  downloadStringAsFile(expensesCsv, `${prefix}_Expenses.csv`, 'text/csv;charset=utf-8');
  
  setTimeout(() => {
    downloadStringAsFile(itineraryCsv, `${prefix}_Itinerary.csv`, 'text/csv;charset=utf-8');
  }, 300);

  setTimeout(() => {
    downloadStringAsFile(tasksCsv, `${prefix}_Tasks.csv`, 'text/csv;charset=utf-8');
  }, 600);

  setTimeout(() => {
    downloadStringAsFile(documentsCsv, `${prefix}_Documents.csv`, 'text/csv;charset=utf-8');
  }, 900);

  setTimeout(() => {
    downloadStringAsFile(generalCsv, `${prefix}_SettingsAndJournal.csv`, 'text/csv;charset=utf-8');
  }, 1200);
}

function downloadStringAsFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
