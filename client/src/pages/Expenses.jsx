import CrudPage from '../components/CrudPage';
import { expensesApi } from '../api/resources';

const columns = [
  { key: 'expenseDate', label: 'Date', render: (r) => new Date(r.expenseDate).toLocaleDateString() },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  { key: 'vehicle', label: 'Vehicle', render: (r) => (r.vehicle ? r.vehicle.regNumber : '—') },
  { key: 'amount', label: 'Amount', render: (r) => `₹${Number(r.amount).toLocaleString()}` },
];

const fields = [
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: ['FUEL', 'MAINTENANCE', 'SALARY', 'INSURANCE', 'MISC'].map((v) => ({ value: v, label: v })),
  },
  { name: 'description', label: 'Description', required: true },
  { name: 'amount', label: 'Amount (₹)', type: 'number', step: '0.01', required: true },
  { name: 'expenseDate', label: 'Date', type: 'date', transformIn: (v) => v?.slice(0, 10) },
  { name: 'paidBy', label: 'Paid By' },
];

export default function Expenses() {
  return (
    <CrudPage
      title="Expenses"
      description="Fuel, maintenance, salary and other operating costs."
      queryKey="expenses"
      resource={expensesApi}
      columns={columns}
      fields={fields}
      searchable={false}
    />
  );
}
