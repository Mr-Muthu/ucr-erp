import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { bookingsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Modal, Money, PageHeader, PlateBadge } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useCursorPagination } from '../lib/useCursorPagination';
import { formatDateTime } from '../lib/format';
import type { Booking } from '../types/domain';

function SettlementModal({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: preview } = useQuery({
    queryKey: ['settlement-preview', bookingId],
    queryFn: () => bookingsApi.settlementPreview(bookingId!),
    enabled: Boolean(bookingId),
  });

  const confirm = useMutation({
    mutationFn: () => bookingsApi.settlementConfirm(bookingId!),
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoiceNumber} generated`);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onClose();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  if (!bookingId) return null;

  return (
    <Modal open={Boolean(bookingId)} onClose={onClose} title="Settlement Preview" wide>
      {!preview ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {preview.lineItems.map((li: any, i: number) => (
                <tr key={i}>
                  <td className="py-1.5">{li.description}</td>
                  <td className="py-1.5 text-right">
                    <Money value={li.amount} />
                  </td>
                </tr>
              ))}
              {preview.discount > 0 && (
                <tr>
                  <td className="py-1.5">Discount</td>
                  <td className="py-1.5 text-right text-red-600">-<Money value={preview.discount} /></td>
                </tr>
              )}
              <tr>
                <td className="py-1.5">GST ({preview.gst.taxType})</td>
                <td className="py-1.5 text-right">
                  <Money value={preview.gst.totalTax} />
                </td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right">
                  <Money value={preview.totalAmount} />
                </td>
              </tr>
              <tr>
                <td className="py-1.5">Advance received</td>
                <td className="py-1.5 text-right">
                  <Money value={preview.advance} />
                </td>
              </tr>
              <tr className="font-bold text-brand-700">
                <td className="py-1.5">Balance due</td>
                <td className="py-1.5 text-right">
                  <Money value={preview.balanceDue} />
                </td>
              </tr>
            </tbody>
          </table>
          <Button className="w-full" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            Generate Invoice
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default function BookingsList() {
  const [statusFilter, setStatusFilter] = useState('');
  const [settlementBookingId, setSettlementBookingId] = useState<string | null>(null);
  const { cursor, hasPrev, goNext, goPrev } = useCursorPagination();

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', statusFilter, cursor],
    queryFn: () => bookingsApi.list({ status: statusFilter || undefined, cursor, limit: 20 }),
  });

  const columns: ColumnDef<Booking, any>[] = [
    { header: 'Booking #', accessorKey: 'bookingNumber' },
    { header: 'Customer', accessorFn: (r) => r.customer?.name ?? '—' },
    { header: 'Type', accessorKey: 'type' },
    { header: 'Vehicle', cell: (c) => (c.row.original.vehicle ? <PlateBadge value={c.row.original.vehicle.registrationNumber} /> : '—') },
    { header: 'Pickup', accessorFn: (r) => formatDateTime(r.pickupDateTime) },
    { header: 'Amount', cell: (c) => <Money value={c.row.original.quotedAmount} /> },
    { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
    {
      header: '',
      id: 'actions',
      cell: (c) =>
        c.row.original.status === 'COMPLETED' ? (
          <button className="text-brand-600 hover:underline" onClick={() => setSettlementBookingId(c.row.original.id)}>
            Settle
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Local / outstation / airport chauffeur bookings."
        actions={
          <Link to="/bookings/new">
            <Button>+ New Booking</Button>
          </Link>
        }
      />
      <div className="mb-4 flex gap-2">
        {['', 'INQUIRY', 'CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'].map((s) => (
          <button
            key={s || 'ALL'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusFilter === s ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            {s || 'ALL'}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        exportFilename="bookings"
        pagination={{ hasNext: Boolean(data?.meta.nextCursor), hasPrev, onNext: () => goNext(data?.meta.nextCursor ?? null), onPrev: goPrev }}
      />
      <SettlementModal bookingId={settlementBookingId} onClose={() => setSettlementBookingId(null)} />
    </div>
  );
}
