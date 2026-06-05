import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useTripStore } from '@/store/useTripStore';

export async function getTripDataForExport(tripId: string) {
  const tripProfile = useTripStore.getState().tripProfile;
  if (!tripProfile || tripProfile.id !== tripId) {
    throw new Error("Trip profile not loaded or mismatch");
  }

  const collections = ['itinerary', 'tasks', 'expenses'];
  const data: Record<string, any[]> = {};
  
  for (const coll of collections) {
    const snap = await getDocs(collection(db, 'trips', tripId, coll));
    data[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  return { 
    tripProfile,
    itinerary: data['itinerary'] || [],
    tasks: data['tasks'] || [],
    expenses: data['expenses'] || []
  };
}

async function generateHTML(tripId: string) {
  const { tripProfile, itinerary, tasks, expenses } = await getTripDataForExport(tripId);
  
  // Sort itinerary by date/time
  itinerary.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>ייצוא טיול: ${tripProfile.name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
        h1 { color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        h2 { color: #4b5563; margin-top: 30px; }
        .section { margin-bottom: 40px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: right; }
        th { background-color: #f9fafb; font-weight: 600; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 12px; background: #e0e7ff; color: #3730a3; }
        @media print {
          body { margin: 0; padding: 20px; }
          button { display: none; }
          .page-break { page-break-after: always; }
        }
      </style>
    </head>
    <body>
      <h1>טיול: ${tripProfile.name}</h1>
      <p><strong>יעדים:</strong> ${(tripProfile.destinations || []).join(', ')}</p>
      <p><strong>תאריכים:</strong> ${tripProfile.startDate} - ${tripProfile.endDate}</p>
      
      <div class="section">
        <h2>מסלול (Itinerary)</h2>
        <table>
          <tr><th>תאריך ושעה</th><th>פעילות</th><th>מיקום</th><th>הערות</th></tr>
          ${itinerary.map((item: any) => `
            <tr>
              <td style="direction: ltr; text-align: right; white-space: nowrap;">${item.startTime ? new Date(item.startTime).toLocaleString() : '-'}</td>
              <td><strong>${item.title || ''}</strong></td>
              <td>${item.location || '-'}</td>
              <td>${item.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <div class="page-break"></div>

      <div class="section">
        <h2>הוצאות (Expenses)</h2>
        <table>
          <tr><th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th>סכום</th></tr>
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
          <tr><th>משימה</th><th>סטטוס</th><th>מוקצה ל</th></tr>
          ${tasks.map((item: any) => `
            <tr>
              <td>${item.title || ''}</td>
              <td>${item.completed ? 'הושלם' : 'בתהליך'}</td>
              <td>${item.assignee || '-'}</td>
            </tr>
          `).join('')}
        </table>
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
  const { itinerary, expenses, tasks } = await getTripDataForExport(tripId);
  
  // Create Expenses CSV
  let expensesCsv = '\uFEFFתאריך,תיאור,קטגוריה,סכום,מטבע\\n';
  expenses.forEach((e: any) => {
    const date = (e.date || e.createdAt) ? new Date(e.date || e.createdAt).toLocaleDateString() : '';
    expensesCsv += `"${date}","${(e.description || '').replace(/"/g, '""')}","${e.category || ''}","${e.amount || 0}","${e.currency || ''}"\\n`;
  });
  
  // Create Itinerary CSV
  let itineraryCsv = '\uFEFFתאריך התחלה,תאריך סיום,פעילות,מיקום,הערות\\n';
  itinerary.forEach((i: any) => {
    const start = i.startTime ? new Date(i.startTime).toLocaleString() : '';
    const end = i.endTime ? new Date(i.endTime).toLocaleString() : '';
    itineraryCsv += `"${start}","${end}","${(i.title || '').replace(/"/g, '""')}","${(i.location || '').replace(/"/g, '""')}","${(i.notes || '').replace(/"/g, '""')}"\\n`;
  });

  // Create Tasks CSV
  let tasksCsv = '\uFEFFמשימה,סטטוס,מוקצה ל\\n';
  tasks.forEach((t: any) => {
    tasksCsv += `"${(t.title || '').replace(/"/g, '""')}","${t.completed ? 'הושלם' : 'בתהליך'}","${(t.assignee || '').replace(/"/g, '""')}"\\n`;
  });

  const name = useTripStore.getState().tripProfile?.name ?? 'Trip';
  const prefix = name.replace(/[^a-z0-9א-ת]/gi, '_');

  downloadStringAsFile(expensesCsv, `${prefix}_Expenses.csv`, 'text/csv;charset=utf-8');
  
  setTimeout(() => {
    downloadStringAsFile(itineraryCsv, `${prefix}_Itinerary.csv`, 'text/csv;charset=utf-8');
  }, 500);

  setTimeout(() => {
    downloadStringAsFile(tasksCsv, `${prefix}_Tasks.csv`, 'text/csv;charset=utf-8');
  }, 1000);
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
