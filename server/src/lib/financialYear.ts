/** India's financial year runs Apr-Mar by default (configurable via FINANCIAL_YEAR_START_MONTH). Returns e.g. "2026-27". */
export function getFinancialYear(date: Date, startMonth = 4): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12
  const fyStartYear = month >= startMonth ? year : year - 1;
  const fyEndYearShort = String((fyStartYear + 1) % 100).padStart(2, '0');
  return `${fyStartYear}-${fyEndYearShort}`;
}

export function monthPeriodBounds(period: string): { periodStart: Date; periodEnd: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Invalid period "${period}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0)); // last day of month
  return { periodStart, periodEnd };
}
