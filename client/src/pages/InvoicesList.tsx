import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { invoicesApi } from '../api/endpoints';
import { Badge, Money, PageHeader } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useCursorPagination } from '../lib/useCursorPagination';
import { formatDate } from '../lib/format';
import type { Invoice } from '../types/domain';

const columns: ColumnDef<Invoice, any>[] = [
  { header: 'Invoice #', accessorKey: 'invoiceNumber' },
  { header: 'Type', accessorKey: 'type' },
  { header: 'Counterparty', accessorFn: (r) => r.vendor?.companyName ?? r.customer?.name ?? '—' },
  { header: 'Issued', accessorFn: (r) => formatDate(r.issueDate) },
  { header: 'Total', cell: (c) => <Money value={c.row.original.totalAmount} /> },
  { header: 'Paid', cell: (c) => <Money value={c.row.original.amountPaid} /> },
  { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
];

export default function InvoicesList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const { cursor, hasPrev, goNext, goPrev } = useCursorPagination();

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', status, cursor],
    queryFn: () => invoicesApi.list({ status: status || undefined, cursor, limit: 20 }),
  });

  return (
    <div>
      <PageHeader title="Invoices" description="GST invoices — vendor monthly, fixed-duty customer monthly, and per-booking." />
      <div className="mb-4 flex gap-2">
        {['', 'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'].map((s) => (
          <button
            key={s || 'ALL'}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            {s || 'ALL'}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        exportFilename="invoices"
        onRowClick={(row) => navigate(`/invoices/${row.id}`)}
        pagination={{ hasNext: Boolean(data?.meta.nextCursor), hasPrev, onNext: () => goNext(data?.meta.nextCursor ?? null), onPrev: goPrev }}
      />
    </div>
  );
}
