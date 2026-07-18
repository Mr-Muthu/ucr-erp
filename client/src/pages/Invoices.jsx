import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bookingsApi, invoicesApi, paymentsApi } from '../api/resources';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../components/ui';

function GenerateInvoiceModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ taxRate: 0, discount: 0 });

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-completed'],
    queryFn: () => bookingsApi.list({ status: 'COMPLETED' }),
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: invoicesApi.generate,
    onSuccess: () => {
      toast.success('Invoice generated');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setForm({ taxRate: 0, discount: 0 });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to generate invoice'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.bookingId) {
      toast.error('Select a booking');
      return;
    }
    generateMutation.mutate(form);
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Invoice">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Completed Booking *">
          <Select value={form.bookingId || ''} onChange={(e) => setForm((p) => ({ ...p, bookingId: e.target.value }))} required>
            <option value="">Select booking…</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bookingNumber} — {b.customer?.name} — ₹{Number(b.totalAmount).toLocaleString()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tax Rate (%)">
          <Input type="number" step="0.01" value={form.taxRate} onChange={(e) => setForm((p) => ({ ...p, taxRate: e.target.value }))} />
        </Field>
        <Field label="Discount (₹)">
          <Input type="number" step="0.01" value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))} />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.dueDate || ''} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={generateMutation.isPending}>
            {generateMutation.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceDetailModal({ invoiceId, onClose }) {
  const queryClient = useQueryClient();
  const [payment, setPayment] = useState({ method: 'CASH' });

  const { data: invoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  });

  const paymentMutation = useMutation({
    mutationFn: paymentsApi.create,
    onSuccess: () => {
      toast.success('Payment recorded');
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setPayment({ method: 'CASH' });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record payment'),
  });

  if (!invoice) return null;

  const balance = Number(invoice.totalAmount) - Number(invoice.amountPaid);

  function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!payment.amount) {
      toast.error('Enter an amount');
      return;
    }
    paymentMutation.mutate({ invoiceId, ...payment });
  }

  return (
    <Modal open={!!invoiceId} onClose={onClose} title={`Invoice ${invoice.invoiceNumber}`} wide>
      <div className="space-y-5">
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="font-semibold text-slate-700">{invoice.customer?.name}</div>
            <div className="text-slate-500">{invoice.customer?.phone}</div>
          </div>
          <Badge value={invoice.status} />
        </div>

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2">{item.description}</td>
                <td className="py-2">{item.quantity}</td>
                <td className="py-2">₹{Number(item.unitPrice).toLocaleString()}</td>
                <td className="py-2 text-right">₹{Number(item.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>₹{Number(invoice.subtotal).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>₹{Number(invoice.taxAmount).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>-₹{Number(invoice.discount).toLocaleString()}</span></div>
          <div className="flex justify-between font-semibold text-slate-800"><span>Total</span><span>₹{Number(invoice.totalAmount).toLocaleString()}</span></div>
          <div className="flex justify-between text-emerald-600"><span>Paid</span><span>₹{Number(invoice.amountPaid).toLocaleString()}</span></div>
          <div className="flex justify-between font-semibold text-red-600"><span>Balance</span><span>₹{balance.toLocaleString()}</span></div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Payments</h3>
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{new Date(p.paidAt).toLocaleDateString()} — {p.method}{p.reference ? ` (${p.reference})` : ''}</span>
                  <span>₹{Number(p.amount).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {balance > 0 && (
          <form onSubmit={handlePaymentSubmit} className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3">
            <Input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={payment.amount || ''}
              onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
            />
            <Select value={payment.method} onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value }))}>
              {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'ONLINE'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
            <Input
              placeholder="Reference (optional)"
              value={payment.reference || ''}
              onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))}
            />
            <Button type="submit" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? 'Saving…' : 'Record Payment'}
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}

export default function Invoices() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Invoices &amp; Payments</h1>
          <p className="text-sm text-slate-500">Generate invoices from completed bookings and track payments.</p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>+ Generate Invoice</Button>
      </div>

      <Card className="p-0">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{inv.invoiceNumber}</td>
                <td className="px-4 py-3">{inv.customer?.name}</td>
                <td className="px-4 py-3">{inv.booking?.bookingNumber}</td>
                <td className="px-4 py-3">₹{Number(inv.totalAmount).toLocaleString()}</td>
                <td className="px-4 py-3">₹{Number(inv.amountPaid).toLocaleString()}</td>
                <td className="px-4 py-3"><Badge value={inv.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setActiveInvoiceId(inv.id)} className="text-brand-600 hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && invoices.length === 0 && <EmptyState message="No invoices yet." />}
      </Card>

      <GenerateInvoiceModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
      {activeInvoiceId && <InvoiceDetailModal invoiceId={activeInvoiceId} onClose={() => setActiveInvoiceId(null)} />}
    </div>
  );
}
