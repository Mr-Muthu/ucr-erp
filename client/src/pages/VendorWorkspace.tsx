import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { categoriesApi, deploymentsApi, reconciliationsApi, vendorsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Money, PageHeader, PlateBadge, Select } from '../components/ui';
import { RoleGate } from '../components/RoleGate';
import { formatDate, formatMoney } from '../lib/format';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function RateCardsPanel({ vendorId }: { vendorId: string }) {
  const queryClient = useQueryClient();
  const [engagementType, setEngagementType] = useState<'DEDICATED_MONTHLY' | 'SPOT_DUTY'>('DEDICATED_MONTHLY');
  const [itemForm, setItemForm] = useState<Record<string, string>>({});
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const { data: rateCards = [] } = useQuery({ queryKey: ['vendor-rate-cards', vendorId], queryFn: () => vendorsApi.rateCards(vendorId) });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list({ limit: 100 }), select: (r: any) => r.data });

  const createCard = useMutation({
    mutationFn: () => vendorsApi.createRateCard(vendorId, { engagementType, effectiveFrom: new Date().toISOString() }),
    onSuccess: () => {
      toast.success('Rate card created');
      queryClient.invalidateQueries({ queryKey: ['vendor-rate-cards', vendorId] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  const addItem = useMutation({
    mutationFn: () => vendorsApi.addRateCardItem(vendorId, activeCardId!, { categoryId: itemForm.categoryId, ...numericFields(itemForm) }),
    onSuccess: () => {
      toast.success('Rate item added');
      queryClient.invalidateQueries({ queryKey: ['vendor-rate-cards', vendorId] });
      setItemForm({});
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">Rate Cards</h2>
        <RoleGate roles={['OWNER', 'MANAGER', 'OPS']}>
          <div className="flex items-center gap-2">
            <Select value={engagementType} onChange={(e) => setEngagementType(e.target.value as any)} className="w-auto">
              <option value="DEDICATED_MONTHLY">Dedicated Monthly</option>
              <option value="SPOT_DUTY">Spot Duty</option>
            </Select>
            <Button variant="secondary" onClick={() => createCard.mutate()} disabled={createCard.isPending}>
              + New version
            </Button>
          </div>
        </RoleGate>
      </div>

      {rateCards.length === 0 && <EmptyState message="No rate cards yet." />}
      <div className="space-y-4">
        {rateCards.map((card) => (
          <div key={card.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <Badge value={card.engagementType} /> <span className="ml-2 text-xs text-slate-400">from {formatDate(card.effectiveFrom)}</span>
              </div>
              <RoleGate roles={['OWNER', 'MANAGER', 'OPS']}>
                <button className="text-xs text-brand-600 hover:underline" onClick={() => setActiveCardId(activeCardId === card.id ? null : card.id)}>
                  {activeCardId === card.id ? 'Cancel' : '+ Add item'}
                </button>
              </RoleGate>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {card.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1 pr-2">{item.category?.name}</td>
                    {card.engagementType === 'DEDICATED_MONTHLY' ? (
                      <td className="py-1 pr-2 text-slate-500">
                        <Money value={item.fixedMonthlyAmount} />/mo, {item.includedKm}km/{item.includedHours}hr incl., +<Money value={item.extraKmRate} />/km
                      </td>
                    ) : (
                      <td className="py-1 pr-2 text-slate-500">
                        {item.slabLabel}: <Money value={item.slabBaseRate} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {activeCardId === card.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addItem.mutate();
                }}
                className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3"
              >
                <Select value={itemForm.categoryId ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, categoryId: e.target.value }))} required>
                  <option value="">Category…</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {card.engagementType === 'DEDICATED_MONTHLY' ? (
                  <>
                    <Input placeholder="Fixed monthly ₹" value={itemForm.fixedMonthlyAmount ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, fixedMonthlyAmount: e.target.value }))} />
                    <Input placeholder="Included km" value={itemForm.includedKm ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, includedKm: e.target.value }))} />
                    <Input placeholder="Included hours" value={itemForm.includedHours ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, includedHours: e.target.value }))} />
                    <Input placeholder="Extra km rate" value={itemForm.extraKmRate ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, extraKmRate: e.target.value }))} />
                    <Input placeholder="Extra hour rate" value={itemForm.extraHourRate ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, extraHourRate: e.target.value }))} />
                  </>
                ) : (
                  <>
                    <Input placeholder="Slab label e.g. 8/80" value={itemForm.slabLabel ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, slabLabel: e.target.value }))} />
                    <Input placeholder="Slab hours" value={itemForm.slabHours ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, slabHours: e.target.value }))} />
                    <Input placeholder="Slab km" value={itemForm.slabKm ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, slabKm: e.target.value }))} />
                    <Input placeholder="Slab base rate" value={itemForm.slabBaseRate ?? ''} onChange={(e) => setItemForm((p) => ({ ...p, slabBaseRate: e.target.value }))} />
                  </>
                )}
                <Button type="submit" disabled={addItem.isPending} className="col-span-3">
                  Save item
                </Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function numericFields(form: Record<string, string>) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(form)) {
    if (k === 'categoryId' || k === 'slabLabel') out[k] = v;
    else if (v !== '') out[k] = Number(v);
  }
  return out;
}

function ReconciliationPanel({ vendorId }: { vendorId: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const api = reconciliationsApi('vendors', vendorId);
  const queryClient = useQueryClient();

  const { data: list = [] } = useQuery({ queryKey: ['reconciliations', vendorId], queryFn: api.list });
  const current = list.find((r) => r.periodStart.slice(0, 7) === period);

  const prepare = useMutation({
    mutationFn: () => api.prepare(period),
    onSuccess: () => {
      toast.success('Reconciliation prepared/refreshed');
      queryClient.invalidateQueries({ queryKey: ['reconciliations', vendorId] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });
  const statement = useMutation({
    mutationFn: () => api.statement(period),
    onSuccess: () => {
      toast.success('Statement sent');
      queryClient.invalidateQueries({ queryKey: ['reconciliations', vendorId] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });
  const finalize = useMutation({
    mutationFn: () => api.finalize(period),
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoiceNumber} generated`);
      queryClient.invalidateQueries({ queryKey: ['reconciliations', vendorId] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });
  const adjustLine = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Record<string, unknown> }) => api.adjustLine(period, lineId, data),
    onSuccess: () => {
      toast.success('Line updated');
      queryClient.invalidateQueries({ queryKey: ['reconciliations', vendorId] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  function exportStatement() {
    if (!current) return;
    const rows = current.lines.map((l) => ({
      Description: l.description,
      Computed: Number(l.computedAmount),
      Claimed: l.claimedAmount ? Number(l.claimedAmount) : '',
      Dispute: l.disputeStatus,
      Adjustment: Number(l.adjustmentAmount),
      Final: Number(l.finalAmount),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, period);
    XLSX.writeFile(wb, `statement-${vendorId}-${period}.xlsx`);
  }

  const total = current?.lines.reduce((sum, l) => sum + Number(l.finalAmount), 0) ?? 0;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">Monthly Reconciliation — where the money is made or lost</h2>
        <div className="flex items-center gap-2">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto" />
          {current && <Badge value={current.status} />}
        </div>
      </div>

      <RoleGate roles={['OWNER', 'MANAGER', 'OPS']}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
            {current ? 'Refresh (prepare)' : 'Prepare'}
          </Button>
          <Button variant="secondary" onClick={() => statement.mutate()} disabled={!current || statement.isPending}>
            Generate statement
          </Button>
          <Button variant="secondary" onClick={exportStatement} disabled={!current}>
            Export XLSX
          </Button>
          <RoleGate roles={['OWNER', 'MANAGER', 'ACCOUNTS']}>
            <Button onClick={() => finalize.mutate()} disabled={!current || finalize.isPending || current.status === 'INVOICED'}>
              {current?.status === 'INVOICED' ? 'Invoiced ✓' : 'Finalize → Invoice'}
            </Button>
          </RoleGate>
        </div>
      </RoleGate>

      {!current ? (
        <EmptyState message="No reconciliation prepared for this period yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Computed</th>
                <th className="px-3 py-2">Claimed (vendor)</th>
                <th className="px-3 py-2">Dispute</th>
                <th className="px-3 py-2">Adjustment</th>
                <th className="px-3 py-2">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {current.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2">
                    <Money value={line.computedAmount} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={line.claimedAmount ?? ''}
                      disabled={current.status === 'INVOICED'}
                      onBlur={(e) => e.target.value && adjustLine.mutate({ lineId: line.id, data: { claimedAmount: Number(e.target.value) } })}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      defaultValue={line.disputeStatus}
                      disabled={current.status === 'INVOICED'}
                      onChange={(e) => adjustLine.mutate({ lineId: line.id, data: { disputeStatus: e.target.value } })}
                      className="w-auto"
                    >
                      {['NONE', 'OPEN', 'ADJUSTED', 'ACCEPTED'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={line.adjustmentAmount}
                      disabled={current.status === 'INVOICED'}
                      onBlur={(e) => adjustLine.mutate({ lineId: line.id, data: { adjustmentAmount: Number(e.target.value), adjustmentReason: 'Adjusted via workspace' } })}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    <Money value={line.finalAmount} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold">
                <td className="px-3 py-2" colSpan={5}>
                  Total
                </td>
                <td className="px-3 py-2">{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function DeploymentsPanel({ vendorId }: { vendorId: string }) {
  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments', 'vendor', vendorId],
    queryFn: () => deploymentsApi.list({ vendorId, limit: 50 }),
    select: (r: any) => r.data,
  });

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-600">Deployments Timeline</h2>
      {deployments.length === 0 ? (
        <EmptyState message="No deployments for this vendor yet." />
      ) : (
        <ul className="space-y-2">
          {deployments.map((d: any) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                {d.vehicleSegments?.[0]?.vehicle && <PlateBadge value={d.vehicleSegments[0].vehicle.registrationNumber} />}
                <span className="text-slate-500">{formatDate(d.startDate)} — {d.endDate ? formatDate(d.endDate) : 'ongoing'}</span>
              </div>
              <Badge value={d.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function VendorWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data: vendor } = useQuery({ queryKey: ['vendor', id], queryFn: () => vendorsApi.get(id!), enabled: Boolean(id) });

  if (!vendor || !id) return <EmptyState message="Loading vendor…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={vendor.companyName}
        description={`GSTIN ${vendor.gstin} — ${vendor.placeOfSupplyStateCode} — credit terms ${vendor.creditTermDays} days`}
        actions={<Badge value={vendor.status} />}
      />
      <DeploymentsPanel vendorId={id} />
      <RateCardsPanel vendorId={id} />
      <ReconciliationPanel vendorId={id} />
    </div>
  );
}
