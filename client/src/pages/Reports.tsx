import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi } from '../api/endpoints';
import { Badge, Card, EmptyState, Field, Input, Money, PageHeader } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useHasRole } from '../components/RoleGate';

const MONEY_MANAGERS = ['OWNER', 'MANAGER', 'ACCOUNTS'] as const;

type ReportTab = 'PNL' | 'AGING' | 'PAYABLES' | 'GST';

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'PNL', label: 'Profit & Loss' },
  { id: 'AGING', label: 'Outstanding Dues' },
  { id: 'PAYABLES', label: 'Driver Payables' },
  { id: 'GST', label: 'GST Summary' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function currentPeriodMonth() {
  return new Date().toISOString().slice(0, 7);
}

function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'positive' | 'negative' }) {
  return (
    <Card className="flex-1">
      <div className="text-xs font-semibold uppercase text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-red-600' : 'text-slate-800'}`}>
        {value}
      </div>
    </Card>
  );
}

function PnlPanel() {
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());
  const { data, isLoading } = useQuery({ queryKey: ['report-pnl', from, to], queryFn: () => reportsApi.pnl(from, to) });

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : data ? (
        <>
          <div className="flex gap-4">
            <StatCard label="B2B Revenue" value={<Money value={data.revenue.b2b} />} />
            <StatCard label="B2C Revenue" value={<Money value={data.revenue.b2c} />} />
            <StatCard label="Total Revenue" value={<Money value={data.revenue.total} />} />
          </div>
          <div className="flex gap-4">
            <StatCard label="Total Expenses" value={<Money value={data.totalExpenses} />} />
            <StatCard label="Net Profit" value={<Money value={data.netProfit} />} tone={data.netProfit >= 0 ? 'positive' : 'negative'} />
          </div>
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-slate-600">Expenses by Category</h3>
            {Object.keys(data.expensesByCategory).length === 0 ? (
              <p className="text-sm text-slate-400">No expenses in this period.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Object.entries(data.expensesByCategory).map(([category, amount]) => (
                  <li key={category} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span>{category}</span>
                    <Money value={amount as number} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function AgingPanel() {
  const [asOf, setAsOf] = useState(todayISO());
  const { data, isLoading } = useQuery({ queryKey: ['report-aging', asOf], queryFn: () => reportsApi.aging(asOf) });

  const columns: ColumnDef<any, any>[] = [
    { header: 'Invoice #', accessorKey: 'invoiceNumber' },
    { header: 'Counterparty', accessorKey: 'counterpartyName' },
    { header: 'Status', cell: (c) => <Badge value={c.row.original.status} /> },
    { header: 'Days Overdue', accessorKey: 'daysOverdue' },
    { header: 'Bucket', accessorKey: 'bucket' },
    { header: 'Balance Due', cell: (c) => <Money value={c.row.original.balanceDue} /> },
  ];

  return (
    <div className="space-y-4">
      <Field label="As of">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="max-w-xs" />
      </Field>
      {data && (
        <div className="flex gap-4">
          <StatCard label="0-30 days" value={<Money value={data.totalsByBucket['0-30']} />} />
          <StatCard label="31-60 days" value={<Money value={data.totalsByBucket['31-60']} />} />
          <StatCard label="61-90 days" value={<Money value={data.totalsByBucket['61-90']} />} />
          <StatCard label="90+ days" value={<Money value={data.totalsByBucket['90+']} />} tone="negative" />
        </div>
      )}
      <DataTable columns={columns} data={data?.rows ?? []} isLoading={isLoading} exportFilename="aging-report" emptyMessage="Nothing outstanding." />
    </div>
  );
}

function PayablesPanel() {
  const [periodMonth, setPeriodMonth] = useState(currentPeriodMonth());
  const { data, isLoading } = useQuery({ queryKey: ['report-payables', periodMonth], queryFn: () => reportsApi.driverPayables(periodMonth) });

  const columns: ColumnDef<any, any>[] = [
    { header: 'Driver', accessorKey: 'driverName' },
    { header: 'Batta', cell: (c) => <Money value={c.row.original.byType.BATTA} /> },
    { header: 'Night Halt', cell: (c) => <Money value={c.row.original.byType.NIGHT_HALT} /> },
    { header: 'Reimbursement', cell: (c) => <Money value={c.row.original.byType.REIMBURSEMENT} /> },
    { header: 'Advance', cell: (c) => <Money value={c.row.original.byType.ADVANCE} /> },
    { header: 'Adjustment', cell: (c) => <Money value={c.row.original.byType.ADJUSTMENT} /> },
    { header: 'Net', cell: (c) => <Money value={c.row.original.netAmount} className="font-bold" /> },
  ];

  return (
    <div className="space-y-4">
      <Field label="Period">
        <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="max-w-xs" />
      </Field>
      <DataTable columns={columns} data={data?.drivers ?? []} isLoading={isLoading} exportFilename="driver-payables" emptyMessage="No payable entries for this period." />
    </div>
  );
}

function GstPanel() {
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());
  const { data, isLoading } = useQuery({ queryKey: ['report-gst', from, to], queryFn: () => reportsApi.gstSummary(from, to) });

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : data ? (
        <>
          <div className="flex gap-4">
            <StatCard label="Taxable Value" value={<Money value={data.taxableValue} />} />
            <StatCard label="CGST" value={<Money value={data.cgstAmount} />} />
            <StatCard label="SGST" value={<Money value={data.sgstAmount} />} />
            <StatCard label="IGST" value={<Money value={data.igstAmount} />} />
          </div>
          <div className="flex gap-4">
            <StatCard label="Total Tax" value={<Money value={data.totalTax} />} />
            <StatCard label="Total Invoice Value" value={<Money value={data.totalInvoiceValue} />} />
            <StatCard label="Invoice Count" value={data.invoiceCount} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>('PNL');
  const canView = useHasRole([...MONEY_MANAGERS]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="P&L, outstanding dues, driver payables, and GST — never hardcoded, always computed from real ledger data." />
        <EmptyState message="Reports are visible to Owner, Manager, and Accounts roles only." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="P&L, outstanding dues, driver payables, and GST — never hardcoded, always computed from real ledger data." />
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'PNL' && <PnlPanel />}
      {tab === 'AGING' && <AgingPanel />}
      {tab === 'PAYABLES' && <PayablesPanel />}
      {tab === 'GST' && <GstPanel />}
    </div>
  );
}
