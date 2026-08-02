/**
 * Pure calculator — DB queries happen in the route, this just sums what
 * it's handed. Revenue is `taxableValue`, not `totalAmount`: GST collected
 * is a liability owed to the government, not company income, so it never
 * belongs in a P&L revenue line.
 */
export interface PLInvoiceInput {
  type: 'VENDOR_MONTHLY' | 'CUSTOMER_FIXED_DUTY_MONTHLY' | 'BOOKING';
  status: string;
  taxableValue: number;
}

export interface PLExpenseInput {
  category: string;
  amount: number;
}

export interface ProfitAndLossResult {
  revenue: { b2b: number; b2c: number; total: number };
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
}

export function computeProfitAndLoss(invoices: PLInvoiceInput[], expenses: PLExpenseInput[]): ProfitAndLossResult {
  // A VOID invoice was reversed via a CreditNote — it never happened as far as revenue is concerned.
  const live = invoices.filter((i) => i.status !== 'VOID');
  const b2b = live.filter((i) => i.type !== 'BOOKING').reduce((sum, i) => sum + i.taxableValue, 0);
  const b2c = live.filter((i) => i.type === 'BOOKING').reduce((sum, i) => sum + i.taxableValue, 0);

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount;
  }
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    revenue: { b2b, b2c, total: b2b + b2c },
    expensesByCategory,
    totalExpenses,
    netProfit: b2b + b2c - totalExpenses,
  };
}
