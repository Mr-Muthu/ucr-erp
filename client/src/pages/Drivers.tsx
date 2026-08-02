import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { driversApi } from '../api/endpoints';
import { CrudListPage, type FormFieldSpec } from '../components/CrudListPage';
import { Badge } from '../components/ui';
import type { Driver } from '../types/domain';

const columns: ColumnDef<Driver, any>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: 'Phone', accessorKey: 'phone' },
  { header: 'License', accessorKey: 'licenseNumber' },
  { header: 'App account', cell: (c) => (c.row.original.account ? <Badge value={c.row.original.account.isActive ? 'ACTIVE' : 'INACTIVE'} /> : '—') },
  { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
];

const formFields: FormFieldSpec[] = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'licenseNumber', label: 'License Number', required: true },
  { name: 'licenseExpiry', label: 'License Expiry', type: 'date' },
  { name: 'monthlySalary', label: 'Monthly Salary (₹)', type: 'number' },
  { name: 'status', label: 'Status', type: 'select', options: ['ACTIVE', 'ON_LEAVE', 'INACTIVE'].map((v) => ({ value: v, label: v })) },
];

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  licenseNumber: z.string().min(2),
  licenseExpiry: z.string().optional(),
  monthlySalary: z.coerce.number().optional(),
  status: z.string().optional(),
});

export default function Drivers() {
  return (
    <CrudListPage
      title="Drivers"
      description="Driver profiles, license tracking, app account status."
      queryKey="drivers"
      resource={driversApi}
      columns={columns}
      formFields={formFields}
      formSchema={schema}
    />
  );
}
