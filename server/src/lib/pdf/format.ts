/** Presentation-only Indian-locale rupee formatting — not part of lib/money.ts's arithmetic, just how a number gets drawn on a page. */
export function formatRupees(value: number | string): string {
  const n = Number(value);
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
