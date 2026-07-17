export const formatNumber = (val: number): string => {
  return (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const parseRobustDate = (dateStr: string): number => {
  if (!dateStr) return 0;
  
  let d = new Date(dateStr.replace(' ', 'T'));
  let time = d.getTime();
  if (!isNaN(time)) return time;

  const parts = dateStr.split(/[\sT]/);
  if (parts.length >= 1) {
    const dateParts = parts[0].split(/[\/-]/);
    if (dateParts.length === 3) {
      let year, month, day;
      if (dateParts[0].length === 4) { 
        year = dateParts[0]; month = dateParts[1]; day = dateParts[2];
      } else {
        day = dateParts[0]; month = dateParts[1]; year = dateParts[2];
      }
      
      let hour = '00', min = '00', sec = '00';
      if (parts.length >= 2) {
        const timeParts = parts[1].split(':');
        if (timeParts.length >= 1) hour = timeParts[0];
        if (timeParts.length >= 2) min = timeParts[1];
        if (timeParts.length >= 3) sec = timeParts[2];
      }

      d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}`);
      time = d.getTime();
      if (!isNaN(time)) return time;
    }
  }
  return 0;
};

export const calculateDurationInSeconds = (t: any): number => {
  let sec = 0;
  try {
    const rawEntryTime = t.entryTime || t.time;
    const rawExitTime = t.exitTime || (t.entryTime ? t.time : undefined);

    if (rawEntryTime && rawExitTime) {
      const entryDate = parseRobustDate(rawEntryTime);
      const exitDate = parseRobustDate(rawExitTime);
      if (entryDate > 0 && exitDate > 0) {
        sec = Math.max(0, Math.floor((exitDate - entryDate) / 1000));
      }
    }
    if (sec === 0 && t.duration) {
      sec = t.duration;
    }
  } catch (e) {}
  return sec;
};

export const formatDurationDetailed = (sec: number): string => {
  if (sec == null || sec < 0) return "-";
  if (sec === 0) return "0s";
  let m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  let h = Math.floor(m / 60); 
  m = m % 60;
  const d = Math.floor(h / 24); 
  h = h % 24;
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
};
