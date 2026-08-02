import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { vendorsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Field, Input, Modal, PageHeader } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { RoleGate } from '../components/RoleGate';
import { useCursorPagination } from '../lib/useCursorPagination';
import { useAuth } from '../auth/AuthContext';
import type { Vendor } from '../types/domain';

const columns: ColumnDef<Vendor, any>[] = [
  { header: 'Company', accessorKey: 'companyName' },
  { header: 'GSTIN', accessorKey: 'gstin' },
  { header: 'State', accessorKey: 'placeOfSupplyStateCode' },
  { header: 'Credit terms', accessorFn: (r) => `${r.creditTermDays} days` },
  { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
];

function NewVendorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      const cleaned = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? undefined : v]));
      return vendorsApi.create({ ...cleaned, branchId: user?.branchId });
    },
    onSuccess: () => {
      toast.success('Vendor created');
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setForm({});
      onClose();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="New Vendor" wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Company name *">
          <Input value={form.companyName ?? ''} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} required />
        </Field>
        <Field label="GSTIN * (15 chars, valid checksum)">
          <Input value={form.gstin ?? ''} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} required />
        </Field>
        <Field label="Place of supply state code *">
          <Input value={form.placeOfSupplyStateCode ?? ''} onChange={(e) => setForm((p) => ({ ...p, placeOfSupplyStateCode: e.target.value }))} maxLength={2} required />
        </Field>
        <div className="col-span-2">
          <Field label="Billing address *">
            <Input value={form.billingAddress ?? ''} onChange={(e) => setForm((p) => ({ ...p, billingAddress: e.target.value }))} required />
          </Field>
        </div>
        <Field label="Contact name">
          <Input value={form.contactName ?? ''} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} />
        </Field>
        <Field label="Contact phone">
          <Input value={form.contactPhone ?? ''} onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))} />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function VendorsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const { cursor, hasPrev, goNext, goPrev } = useCursorPagination();

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', search, cursor],
    queryFn: () => vendorsApi.list({ search: search || undefined, cursor, limit: 20 }),
  });

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="B2B vendor supply — the primary business."
        actions={
          <RoleGate roles={['OWNER', 'MANAGER', 'OPS']}>
            <Button onClick={() => setNewOpen(true)}>+ New Vendor</Button>
          </RoleGate>
        }
      />
      <div className="mb-4">
        <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        exportFilename="vendors"
        onRowClick={(row) => navigate(`/vendors/${row.id}`)}
        pagination={{ hasNext: Boolean(data?.meta.nextCursor), hasPrev, onNext: () => goNext(data?.meta.nextCursor ?? null), onPrev: goPrev }}
      />
      <NewVendorModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
