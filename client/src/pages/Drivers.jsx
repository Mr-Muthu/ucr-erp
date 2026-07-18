import CrudPage from '../components/CrudPage';
import { Badge } from '../components/ui';
import { driversApi } from '../api/resources';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'licenseNumber', label: 'License No.' },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
  { key: 'salary', label: 'Salary', render: (r) => (r.salary ? `₹${Number(r.salary).toLocaleString()}` : '—') },
];

const fields = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'licenseNumber', label: 'License Number', required: true },
  { name: 'licenseExpiry', label: 'License Expiry', type: 'date', transformIn: (v) => v?.slice(0, 10) },
  { name: 'address', label: 'Address' },
  { name: 'salary', label: 'Monthly Salary (₹)', type: 'number', step: '0.01' },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: ['ACTIVE', 'ON_TRIP', 'ON_LEAVE', 'INACTIVE'].map((v) => ({ value: v, label: v })),
  },
];

export default function Drivers() {
  return (
    <CrudPage
      title="Drivers"
      description="Driver profiles, license tracking and status."
      queryKey="drivers"
      resource={driversApi}
      columns={columns}
      fields={fields}
    />
  );
}
