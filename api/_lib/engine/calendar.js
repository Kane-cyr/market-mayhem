// The fictional calendar: 6 sessions per day, 30-day months, 12 months, 360-day years.
export const TPD = 6, DPM = 30, MPY = 12, DPY = 360;
export const BASE_YEAR = 41;
export const MONTHS = ['Aurelis', 'Brumal', 'Cindrel', 'Dovane', 'Embrel', 'Fenmoor', 'Gildara', 'Hesper', 'Ivaren', 'Jessamar', 'Kestral', 'Lunaris'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SESSIONS = ['Open', 'Morning', 'Midday', 'Afternoon', 'Late', 'Close'];

export const dayOf = t => Math.floor(t / TPD);
export const sessionOf = t => ((t % TPD) + TPD) % TPD;

export function dateOf(t) {
  const day = dayOf(t);
  const doy = ((day % DPY) + DPY) % DPY;
  return {
    day, year: BASE_YEAR + Math.floor(day / DPY), month: Math.floor(doy / DPM), dom: (doy % DPM) + 1,
    weekday: WEEKDAYS[((day % 7) + 7) % 7], session: SESSIONS[sessionOf(t)],
  };
}
export function fmtDate(t) { const d = dateOf(t); return `${d.dom} ${MONTHS[d.month]}, YE ${d.year}`; }
export function fmtDateTime(t) { const d = dateOf(t); return `${d.dom} ${MONTHS[d.month]} YE${d.year} · ${d.session}`; }
export function fmtShort(t) { const d = dateOf(t); return `${d.dom} ${MONTHS[d.month].slice(0, 3)}`; }
