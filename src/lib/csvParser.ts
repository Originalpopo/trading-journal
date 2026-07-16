import Papa from 'papaparse';
import { doc, getDoc, writeBatch, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const normalizeDateStr = (dateStr: string) => {
  if (!dateStr) return dateStr;
  const match = dateStr.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+'(\d{2})\s+(\d{1,2}:\d{2})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2];
    const year = "20" + match[3];
    const time = match[4] + ":00";
    
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const month = months[monthStr] || '01';
    
    return `${year}-${month}-${day} ${time}`;
  }
  return dateStr;
};

const parseCustomDate = (dateStr: string) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr.replace(' ', 'T'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

export const processTradeImportData = async (data: any[], onProgress?: (status: string) => void) => {
  if (onProgress) onProgress('Importing...');
  const batch = writeBatch(db);
  let importCount = 0;
  let skipCount = 0;

  let latestRisk = 0;
  let latestTf = "none";
  try {
    const q = query(collection(db, 'trades'), orderBy('time', 'desc'), limit(15));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        if (latestRisk === 0 && Number(data.risk) > 0) {
          latestRisk = Number(data.risk);
        }
        if (latestTf === "none" && data.tf && data.tf !== "none") {
          latestTf = data.tf;
        }
        if (latestRisk > 0 && latestTf !== "none") break;
      }
    }
  } catch (e) {
    console.error("Error fetching latest risk/tf:", e);
  }

  const positions: Record<string, any[]> = {};
  for (const row of data) {
    if (!row['Status'] || row['Status'].toLowerCase() !== 'filled') continue;
    const posId = row['Position ID'] || row['Order ID'];
    if (!posId) continue;

    if (!positions[posId]) positions[posId] = [];
    positions[posId].push(row);
  }

  for (const posId in positions) {
    const rows = positions[posId];
    
    let entryRow: any = null;
    const exitRows: any[] = [];

    rows.forEach(r => {
      const pnlStr = String(r['Closed P&L'] || r['Closed P&L ($)'] || '').trim();
      if (pnlStr === '') {
        if (!entryRow) entryRow = r;
      } else {
        exitRows.push(r);
      }
    });

    if (exitRows.length === 0) continue; 

    let totalProfit = 0;
    let totalCommission = 0;
    exitRows.forEach(r => {
      totalProfit += parseFloat(String(r['Closed P&L'] || r['Closed P&L ($)'] || 0).replace(/[$,]/g, '')) || 0;
      totalCommission += parseFloat(r['Commission'] || 0);
    });
    if (entryRow) totalCommission += parseFloat(entryRow['Commission'] || 0);

    const lastExitRow = exitRows[exitRows.length - 1]; 

    const docRef = doc(db, 'trades', posId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      skipCount++;
    } else {
      let entryTimeStr = entryRow ? (entryRow['Update Time'] || entryRow['Date']) : (lastExitRow['Update Time'] || lastExitRow['Date']);
      let exitTimeStr = lastExitRow['Update Time'] || lastExitRow['Date'] || new Date().toISOString();
      
      entryTimeStr = normalizeDateStr(entryTimeStr);
      exitTimeStr = normalizeDateStr(exitTimeStr);
      
      let duration = 0;
      try {
        const tEntry = parseCustomDate(entryTimeStr);
        const tExit = parseCustomDate(exitTimeStr);
        if (!isNaN(tEntry) && !isNaN(tExit) && tExit >= tEntry) {
          duration = Math.floor((tExit - tEntry) / 1000);
        }
      } catch(e) {}

      if (!duration || duration <= 0) {
        duration = 60;
      }

      const resType = totalProfit === 0 ? 'BE' : (totalProfit > 0 ? 'TP' : 'SL');

      let side = String(entryRow ? entryRow['Side'] : '').toUpperCase();
      if (!side && lastExitRow) {
        const exitSide = String(lastExitRow['Side'] || '').toUpperCase();
        side = exitSide === 'BUY' ? 'SELL' : (exitSide === 'SELL' ? 'BUY' : exitSide);
      }

      const tradeData = {
        position_id: posId,
        symbol: String(lastExitRow['Symbol'] || '').toUpperCase().trim(),
        side: side,
        time: exitTimeStr,
        entryTime: entryTimeStr,
        duration: duration,
        isOnPlan: true,
        checklists: ['On Plan', 'Follow'],
        qty: parseFloat(entryRow ? entryRow['Filled Qty'] : lastExitRow['Filled Qty']) || 0,
        price: parseFloat(entryRow ? entryRow['Avg Fill Price'] : lastExitRow['Avg Fill Price']) || 0,
        commission: totalCommission,
        profit: totalProfit,
        type: entryRow ? entryRow['Type'] : lastExitRow['Type'],
        resultType: resType,
        risk: latestRisk,
        rr: latestRisk > 0 ? totalProfit / latestRisk : 0,
        tf: latestTf
      };

      batch.set(docRef, tradeData);
      importCount++;
    }
  }

  if (importCount > 0) {
    await batch.commit();
  }

  return { importCount, skipCount };
};

export const handleCSVUpload = (file: File, onProgress?: (status: string) => void, onComplete?: (result: { importCount: number, skipCount: number }) => void, onError?: (error: any) => void) => {
  if (onProgress) onProgress('Parsing...');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async function (results) {
      try {
        const result = await processTradeImportData(results.data, onProgress);
        if (onComplete) onComplete(result);
      } catch (e) {
        if (onError) onError(e);
      }
    },
    error: function (err) {
      if (onError) onError(err);
    }
  });
};

export const handlePasteText = async (text: string, onProgress?: (status: string) => void, onComplete?: (result: { importCount: number, skipCount: number }) => void, onError?: (error: any) => void) => {
  if (!text.trim()) {
    if (onError) onError(new Error("Empty text"));
    return;
  }
  
  if (onProgress) onProgress("Parsing Paste...");
  
  try {
    const parsedData: any[] = [];
    const rawBlocks = text.split(/\n\s*\n/);
    for (const block of rawBlocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length < 5) continue;

      const statusLine = lines[lines.length - 2].toLowerCase();
      if (statusLine !== 'filled') continue;

      const lastTokens = lines[lines.length - 1].split('\t');
      const posId = lastTokens[1];
      if (!posId) continue;

      const typeQty = lines[2].split('\t');

      parsedData.push({
        'Status': 'Filled',
        'Position ID': posId,
        'Symbol': lines[0],
        'Side': lines[1],
        'Type': typeQty[0] || '',
        'Qty': typeQty[1] || '0',
        'Filled Qty': typeQty[2] || '0',
        'Avg Fill Price': lines[lines.length - 3] || '0',
        'Update Time': lastTokens[0] || '',
        'Commission': lastTokens[2] || '0',
        'Closed P&L': lastTokens[3] || ''
      });
    }

    const result = await processTradeImportData(parsedData, onProgress);
    if (onComplete) onComplete(result);
  } catch (err) {
    if (onError) onError(err);
  }
};
