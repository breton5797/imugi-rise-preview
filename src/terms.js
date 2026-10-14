// The 24 solar terms (jeolgi) that name each day's flight. Start dates are the usual calendar
// dates; the astronomical moment drifts by up to a day from year to year, which is close
// enough for a label and keeps this free of ephemeris tables.
const STARTS = Object.freeze([
  [1, 5], [1, 20], [2, 4], [2, 19], [3, 5], [3, 20], [4, 5], [4, 20], [5, 5], [5, 21], [6, 6], [6, 21],
  [7, 7], [7, 23], [8, 7], [8, 23], [9, 8], [9, 23], [10, 8], [10, 23], [11, 7], [11, 22], [12, 7], [12, 22],
]);

/**
 * @param {string} dateKey YYYY-MM-DD
 * @returns {number} 0 (Sohan) … 23 (Dongji): the term in effect on that date
 */
export function solarTermIndex(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  let index = STARTS.length - 1; // the first days of January still belong to Dongji
  STARTS.forEach(([m, d], i) => { if (month > m || (month === m && day >= d)) index = i; });
  return index;
}

export const TERM_COUNT = STARTS.length;
