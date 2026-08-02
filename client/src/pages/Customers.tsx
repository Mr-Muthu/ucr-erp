import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { customersApi } from '../api/endpoints';
import { CrudListPage, type FormFieldSpec } from '../components/CrudListPage';
import { Badge } from '../components/ui';
import type { Customer } from '../types/domain';

const columns: ColumnDef<Customer, any>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: 'Phone', accessorKey: 'phone' },
  { header: 'Type', accessorKey: 'type' },
  { header: 'GSTIN', accessorFn: (r) => r.gstin ?? '—' },
  { header: 'Status', cell: (c) => (c.row.original.isBlacklisted ? <Badge value="BLACKLISTED" /> : <Badge value="ACTIVE" />) },
];

const formFields: FormFieldSpec[] = [
  { name: 'type', label: 'Type', type: 'select', options: [{ value: 'INDIVIDUAL', label: 'Individual' }, { value: 'BUSINESS', label: 'Business' }] },
  { name: 'name', label: 'Full Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'gstin', label: 'GSTIN (if business)' },
];

const schema = z.object({
  type: z.string().optional(),
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().optional(),
});

export default function Customers() {
  return (
    <CrudListPage
      title="Customers"
      description="B2C customer directory."
      queryKey="customers"
      resource={customersApi}
      columns={columns}
      formFields={formFields}
      formSchema={schema}
    />
  );
}
