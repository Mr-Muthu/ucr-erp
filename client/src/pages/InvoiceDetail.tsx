import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { invoicesApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Money, PageHeader, Select, Textarea } from '../components/ui';
import { RoleGate } from '../components/RoleGate';
import { formatDate } from '../lib/format';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirmText, setVoidConfirmText] = useState('');
  const [paymentMode, setPaymentMode] = useState('BANK');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const { data: invoice, isLoading } = useQuery({ queryKey: ['invoice', id], queryFn: () => invoicesApi.get(id!), enabled: Boolean(id) });

  const recordPayment = useMutation({
    mutationFn: () => invoicesApi.recordPayment(id!, { mode: paymentMode, amount: Number(paymentAmount), reference: paymentRef || undefined }),
    onSuccess: () => {
      toast.success('Payment recorded');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setPaymentAmount('');
      setPaymentRef('');
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  const voidInvoice = useMutation({
    mutationFn: () => invoicesApi.void(id!, voidReason),
    onSuccess: () => {
      toast.success('Invoice voided, credit note issued');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setVoidOpen(false);
      setVoidReason('');
      setVoidConfirmText('');
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  if (isLoading || !invoice) return <EmptyState message="Loading invoice…" />;

  const balance = Number(invoice.totalAmount) - Number(invoice.amountPaid);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.type.replaceAll('_', ' ')} — issued ${formatDate(invoice.issueDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge value={invoice.status} />
            <RoleGate roles={['OWNER']}>
              {invoice.status !== 'VOID' && (
                <Button variant="danger" onClick={() => setVoidOpen(true)}>
                  Void
                </Button>
              )}
            </RoleGate>
          </div>
        }
      />

      {/* GST header block mirroring the printed invoice layout */}
      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Supplier</div>
            <div className="mt-1">Ulagammal Car Rental</div>
            <div className="text-slate-500">GSTIN: {invoice.supplierGstin}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Recipient</div>
            <div className="mt-1">{invoice.vendor?.companyName ?? invoice.customer?.name ?? '—'}</div>
            <div className="text-slate-500">GSTIN: {invoice.recipientGstin ?? '—'}</div>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400">Place of supply: </span>
            {invoice.placeOfSupplyStateCode}
          </div>
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400">Tax type: </span>
            {invoice.taxType}
          </div>
        </div>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2">HSN/SAC</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Taxable</th>
              <th className="py-2 text-right">GST %</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lineItems?.map((li) => (
              <tr key={li.id}>
                <td className="py-2">{li.description}</td>
                <td className="py-2">{li.hsnSac}</td>
                <td className="py-2 text-right">{li.quantity}</td>
                <td className="py-2 text-right">
                  <Money value={li.unitRate} />
                </td>
                <td className="py-2 text-right">
                  <Money value={li.taxableValue} />
                </td>
                <td className="py-2 text-right">{li.gstRatePct}%</td>
                <td className="py-2 text-right">
                  <Money value={li.lineTotal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <Money value={invoice.taxableValue} />
          </div>
          {invoice.taxType === 'CGST_SGST' ? (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <Money value={invoice.cgstAmount} />
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <Money value={invoice.sgstAmount} />
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span>IGST</span>
              <Money value={invoice.igstAmount} />
            </div>
          )}
          <div className="flex justify-between">
            <span>Rounding</span>
            <Money value={invoice.roundingAdjustment} />
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
            <span>Total</span>
            <Money value={invoice.totalAmount} />
          </div>
          <div className="flex justify-between text-emerald-600">
            <span>Paid</span>
            <Money value={invoice.amountPaid} />
          </div>
          <div className="flex justify-between font-bold text-red-600">
            <span>Balance due</span>
            <Money value={balance} />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Payments</h2>
        {(invoice.paymentAllocations?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400">No payments recorded.</p>
        ) : (
          <ul className="mb-4 space-y-1 text-sm">
            {invoice.paymentAllocations!.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-slate-100 py-1">
                <span>
                  {formatDate(p.payment.receivedAt)} — {p.payment.mode}
                  {p.payment.reference ? ` (${p.payment.reference})` : ''}
                </span>
                <Money value={p.amount} />
              </li>
            ))}
          </ul>
        )}
        <RoleGate roles={['OWNER', 'MANAGER', 'ACCOUNTS']}>
          {balance > 0 && invoice.status !== 'VOID' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                recordPayment.mutate();
              }}
              className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3"
            >
              <Input type="number" placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {['CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Input placeholder="Reference (optional)" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
              <Button type="submit" disabled={recordPayment.isPending}>
                Record Payment
              </Button>
            </form>
          )}
        </RoleGate>
      </Card>

      {(invoice.creditNotes?.length ?? 0) > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Credit Notes</h2>
          <ul className="space-y-1 text-sm">
            {invoice.creditNotes!.map((cn) => (
              <li key={cn.id} className="flex justify-between">
                <span>
                  {cn.creditNoteNumber} — {cn.reason}
                </span>
                <Money value={cn.totalAmount} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={voidOpen}
        onClose={() => {
          setVoidOpen(false);
          setVoidReason('');
          setVoidConfirmText('');
        }}
        title="Void this invoice"
      >
        <p className="mb-4 text-sm text-slate-600">
          This generates a reversing credit note and marks the invoice VOID. This cannot be undone.
        </p>
        <div className="space-y-3">
          <Field label="Reason for voiding *">
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} />
          </Field>
          <Field label={`Type "${invoice.invoiceNumber}" to confirm`}>
            <Input value={voidConfirmText} onChange={(e) => setVoidConfirmText(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setVoidOpen(false);
              setVoidReason('');
              setVoidConfirmText('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={voidConfirmText.trim() !== invoice.invoiceNumber || voidReason.trim().length < 5 || voidInvoice.isPending}
            onClick={() => voidInvoice.mutate()}
          >
            Void invoice
          </Button>
        </div>
      </Modal>
    </div>
  );
}
