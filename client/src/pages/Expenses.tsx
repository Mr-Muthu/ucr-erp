import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { expensesApi } from '../api/endpoints';
import { CrudListPage, type FormFieldSpec } from '../components/CrudListPage';
import { Money } from '../components/ui';
import { formatDate } from '../lib/format';
import type { Expense } from '../types/domain';

const columns: ColumnDef<Expense, any>[] = [
  { header: 'Date', accessorFn: (r) => formatDate(r.expenseDate) },
  { header: 'Category', accessorKey: 'category' },
  { header: 'Description', accessorKey: 'description' },
  { header: 'Vehicle', accessorFn: (r) => r.vehicle?.registrationNumber ?? '—' },
  { header: 'Amount', cell: (c) => <Money value={c.row.original.amount} /> },
];

const formFields: FormFieldSpec[] = [
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: ['FUEL', 'TOLL', 'MAINTENANCE', 'INSURANCE', 'EMI', 'SALARY', 'CHALLAN', 'MISC'].map((v) => ({ value: v, label: v })),
  },
  { name: 'description', label: 'Description', required: true },
  { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
  { name: 'expenseDate', label: 'Date', type: 'date' },
  { name: 'vehicleId', label: 'Vehicle ID (optional)' },
];

const schema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  expenseDate: z.string().optional(),
  vehicleId: z.string().optional(),
});

export default function Expenses() {
  return (
    <CrudListPage
      title="Expenses"
      description="Fuel, maintenance, salary and other operating costs."
      queryKey="expenses"
      resource={expensesApi}
      columns={columns}
      formFields={formFields}
      formSchema={schema}
      searchable={false}
    />
  );
}
