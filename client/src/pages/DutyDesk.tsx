import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dutiesApi, driversApi, vehiclesApi, vendorsApi, deploymentsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PlateBadge, Select } from '../components/ui';
import { RoleGate } from '../components/RoleGate';
import { formatDateTime } from '../lib/format';
import type { Duty } from '../types/domain';

const COLUMNS: Array<{ status: string; label: string }> = [
  { status: 'ASSIGNED', label: 'Assigned' },
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'STARTED', label: 'Started' },
  { status: 'COMPLETED', label: 'Completed' },
  { status: 'SUBMITTED', label: 'Awaiting Approval' },
  { status: 'DISPUTED', label: 'Disputed' },
];

function NewDutyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'VENDOR_SPOT' | 'DEPLOYMENT'>('VENDOR_SPOT');
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: drivers = [] } = useQuery({ queryKey: ['drivers-all'], queryFn: () => driversApi.list({ limit: 100 }), enabled: open, select: (r: any) => r.data });
  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles-all'], queryFn: () => vehiclesApi.list({ limit: 100 }), enabled: open, select: (r: any) => r.data });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors-all'], queryFn: () => vendorsApi.list({ limit: 100 }), enabled: open, select: (r: any) => r.data });
  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments-all'],
    queryFn: () => deploymentsApi.list({ limit: 100, status: 'ACTIVE' }),
    enabled: open,
    select: (r: any) => r.data,
  });

  const createMutation = useMutation({
    mutationFn: dutiesApi.create,
    onSuccess: () => {
      toast.success('Duty created');
      queryClient.invalidateQueries({ queryKey: ['duties'] });
      setForm({});
      onClose();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.driverId || !form.vehicleId || !form.scheduledStart) {
      toast.error('Driver, vehicle and scheduled start are required');
      return;
    }
    const branchId = drivers.find((d: any) => d.id === form.driverId)?.branchId;
    createMutation.mutate({
      branchId,
      driverId: form.driverId,
      vehicleId: form.vehicleId,
      scheduledStart: form.scheduledStart,
      scheduledEnd: form.scheduledEnd || undefined,
      passengerName: form.passengerName || undefined,
      routeRemarks: form.routeRemarks || undefined,
      ...(mode === 'VENDOR_SPOT' ? { vendorId: form.vendorId, vendorRateCardItemId: form.vendorRateCardItemId || undefined } : { deploymentId: form.deploymentId }),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign New Duty" wide>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex gap-2">
          <button type="button" onClick={() => setMode('VENDOR_SPOT')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'VENDOR_SPOT' ? 'bg-brand-600 text-white' : 'border border-slate-300'}`}>
            Vendor Spot Duty
          </button>
          <button type="button" onClick={() => setMode('DEPLOYMENT')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'DEPLOYMENT' ? 'bg-brand-600 text-white' : 'border border-slate-300'}`}>
            Dedicated Deployment Duty
          </button>
        </div>

        {mode === 'VENDOR_SPOT' ? (
          <Field label="Vendor *">
            <Select value={form.vendorId ?? ''} onChange={(e) => handleChange('vendorId', e.target.value)} required>
              <option value="">Select vendor…</option>
              {vendors.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.companyName}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Active Deployment *">
            <Select value={form.deploymentId ?? ''} onChange={(e) => handleChange('deploymentId', e.target.value)} required>
              <option value="">Select deployment…</option>
              {deployments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {(d.vendor?.companyName ?? d.customer?.name) || d.id}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Driver *">
          <Select value={form.driverId ?? ''} onChange={(e) => handleChange('driverId', e.target.value)} required>
            <option value="">Select driver…</option>
            {drivers.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.phone}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle *">
          <Select value={form.vehicleId ?? ''} onChange={(e) => handleChange('vehicleId', e.target.value)} required>
            <option value="">Select vehicle…</option>
            {vehicles.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.registrationNumber} — {v.make} {v.model}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scheduled Start *">
          <Input type="datetime-local" value={form.scheduledStart ?? ''} onChange={(e) => handleChange('scheduledStart', e.target.value)} required />
        </Field>
        <Field label="Scheduled End">
          <Input type="datetime-local" value={form.scheduledEnd ?? ''} onChange={(e) => handleChange('scheduledEnd', e.target.value)} />
        </Field>
        <Field label="Passenger name">
          <Input value={form.passengerName ?? ''} onChange={(e) => handleChange('passengerName', e.target.value)} />
        </Field>
        <Field label="Route remarks">
          <Input value={form.routeRemarks ?? ''} onChange={(e) => handleChange('routeRemarks', e.target.value)} />
        </Field>

        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Assign Duty'}
          </Button>
        </div>
      </form>
    </Modal>
  );

  function handleChange(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
}

function ApproveModal({ duty, onClose }: { duty: Duty | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: (action: string) => dutiesApi.transition(duty!.id, action, reason || undefined),
    onSuccess: (_data, action) => {
      toast.success(`Duty ${action === 'approve' ? 'approved' : action}d`);
      queryClient.invalidateQueries({ queryKey: ['duties'] });
      setReason('');
      onClose();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  if (!duty) return null;

  return (
    <Modal open={Boolean(duty)} onClose={onClose} title={`Review duty ${duty.id.slice(-8)}`} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <div className="text-xs font-semibold uppercase text-slate-400">Opening odometer</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{duty.openingOdometer ?? '—'} km</div>
            <div className="mt-2 text-xs text-slate-400 truncate">Photo key: {duty.openingOdometerPhotoKey ?? 'none'}</div>
          </Card>
          <Card>
            <div className="text-xs font-semibold uppercase text-slate-400">Closing odometer</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{duty.closingOdometer ?? '—'} km</div>
            <div className="mt-2 text-xs text-slate-400 truncate">Photo key: {duty.closingOdometerPhotoKey ?? 'none'}</div>
          </Card>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <span className="font-semibold">Distance run: </span>
          {duty.openingOdometer !== undefined && duty.closingOdometer !== undefined ? `${duty.closingOdometer - duty.openingOdometer} km` : '—'}
        </div>
        <Field label="Reason (required for dispute/reject)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. km entered doesn't match route distance" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => mutation.mutate('reject')} disabled={mutation.isPending}>
            Reject (send back)
          </Button>
          <Button variant="danger" onClick={() => mutation.mutate('dispute')} disabled={mutation.isPending}>
            Dispute
          </Button>
          <Button onClick={() => mutation.mutate('approve')} disabled={mutation.isPending}>
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function DutyDesk() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newDutyOpen, setNewDutyOpen] = useState(false);
  const [reviewDuty, setReviewDuty] = useState<Duty | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters = {
    driverId: searchParams.get('driverId') ?? '',
    vehicleId: searchParams.get('vehicleId') ?? '',
    vendorId: searchParams.get('vendorId') ?? '',
    status: searchParams.get('status') ?? '',
  };

  const { data: duties = [], isLoading } = useQuery({
    queryKey: ['duties', filters],
    queryFn: () =>
      dutiesApi.list({
        limit: 100,
        ...(filters.driverId ? { driverId: filters.driverId } : {}),
        ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
        ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      }),
    select: (r: any) => r.data as Duty[],
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => dutiesApi.transition(id, 'approve')));
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ok: ids.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      toast.success(`Approved ${ok} duties${failed ? `, ${failed} failed` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['duties'] });
      setSelected(new Set());
    },
  });

  const columns = useMemo(() => {
    if (filters.status) return COLUMNS.filter((c) => c.status === filters.status);
    return COLUMNS;
  }, [filters.status]);

  const submittedIds = duties.filter((d) => d.status === 'SUBMITTED').map((d) => d.id);

  return (
    <div>
      <PageHeader
        title="Duty Control Desk"
        description="Create, track and approve duties. Filter by vendor/driver/vehicle/status."
        actions={
          <RoleGate roles={['OWNER', 'MANAGER', 'OPS']}>
            <Button onClick={() => setNewDutyOpen(true)}>+ Assign Duty</Button>
          </RoleGate>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by driverId"
          value={filters.driverId}
          onChange={(e) => setSearchParams((p) => setParam(p, 'driverId', e.target.value))}
          className="max-w-[180px]"
        />
        <Input
          placeholder="Filter by vehicleId"
          value={filters.vehicleId}
          onChange={(e) => setSearchParams((p) => setParam(p, 'vehicleId', e.target.value))}
          className="max-w-[180px]"
        />
        <Input
          placeholder="Filter by vendorId"
          value={filters.vendorId}
          onChange={(e) => setSearchParams((p) => setParam(p, 'vendorId', e.target.value))}
          className="max-w-[180px]"
        />
        {filters.status && (
          <button onClick={() => setSearchParams((p) => setParam(p, 'status', ''))} className="text-sm text-brand-600 underline">
            Clear status filter ({filters.status})
          </button>
        )}
        {submittedIds.length > 0 && (
          <Button variant="secondary" onClick={() => bulkApprove.mutate(submittedIds)} disabled={bulkApprove.isPending}>
            Bulk-approve all {submittedIds.length} awaiting approval
          </Button>
        )}
      </div>

      {isLoading ? (
        <EmptyState message="Loading duties…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {columns.map((col) => {
            const items = duties.filter((d) => d.status === col.status);
            return (
              <div key={col.status} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-600">{col.label}</h3>
                  <span className="text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((duty) => (
                    <div key={duty.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                      {/* Status is already the column header — showing it again per-card just overflows narrow columns */}
                      <div className="mb-1">{duty.vehicle && <PlateBadge value={duty.vehicle.registrationNumber} />}</div>
                      <div className="truncate text-slate-600">{duty.driver?.name}</div>
                      <div className="text-slate-400">{formatDateTime(duty.scheduledStart)}</div>
                      {duty.status === 'SUBMITTED' && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(duty.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              e.target.checked ? next.add(duty.id) : next.delete(duty.id);
                              setSelected(next);
                            }}
                          />
                          <button onClick={() => setReviewDuty(duty)} className="text-brand-600 hover:underline">
                            Review
                          </button>
                        </div>
                      )}
                      {duty.status === 'DISPUTED' && (
                        <RoleGate roles={['OWNER', 'MANAGER']}>
                          <button
                            onClick={() => dutiesApi.transition(duty.id, 'resolve').then(() => queryClient.invalidateQueries({ queryKey: ['duties'] }))}
                            className="mt-2 text-brand-600 hover:underline"
                          >
                            Mark resolved
                          </button>
                        </RoleGate>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && <div className="py-4 text-center text-xs text-slate-300">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewDutyModal open={newDutyOpen} onClose={() => setNewDutyOpen(false)} />
      <ApproveModal duty={reviewDuty} onClose={() => setReviewDuty(null)} />
    </div>
  );
}

function setParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}
