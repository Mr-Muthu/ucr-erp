import CrudPage from '../components/CrudPage';
import { Badge } from '../components/ui';
import { vehiclesApi } from '../api/resources';

const columns = [
  { key: 'regNumber', label: 'Reg. Number' },
  { key: 'vehicle', label: 'Vehicle', render: (r) => `${r.make} ${r.model} (${r.year})` },
  { key: 'category', label: 'Category' },
  { key: 'seatingCapacity', label: 'Seats' },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
  { key: 'dailyRate', label: 'Daily Rate', render: (r) => `₹${Number(r.dailyRate).toLocaleString()}` },
  { key: 'odometer', label: 'Odometer (km)' },
];

const fields = [
  { name: 'regNumber', label: 'Registration Number', required: true },
  { name: 'make', label: 'Make', required: true },
  { name: 'model', label: 'Model', required: true },
  { name: 'year', label: 'Year', type: 'number', required: true },
  { name: 'category', label: 'Category (Sedan, SUV, MUV…)', required: true },
  { name: 'seatingCapacity', label: 'Seating Capacity', type: 'number', required: true },
  {
    name: 'fuelType',
    label: 'Fuel Type',
    type: 'select',
    options: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'].map((v) => ({ value: v, label: v })),
  },
  {
    name: 'transmission',
    label: 'Transmission',
    type: 'select',
    options: ['MANUAL', 'AUTOMATIC'].map((v) => ({ value: v, label: v })),
  },
  { name: 'dailyRate', label: 'Daily Rate (₹)', type: 'number', step: '0.01', required: true },
  { name: 'hourlyRate', label: 'Hourly Rate (₹)', type: 'number', step: '0.01' },
  { name: 'odometer', label: 'Odometer (km)', type: 'number' },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: ['AVAILABLE', 'BOOKED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'].map((v) => ({ value: v, label: v })),
  },
  { name: 'insuranceExpiry', label: 'Insurance Expiry', type: 'date', transformIn: (v) => v?.slice(0, 10) },
  { name: 'permitExpiry', label: 'Permit Expiry', type: 'date', transformIn: (v) => v?.slice(0, 10) },
  { name: 'pucExpiry', label: 'PUC Expiry', type: 'date', transformIn: (v) => v?.slice(0, 10) },
];

export default function Vehicles() {
  return (
    <CrudPage
      title="Vehicles"
      description="Fleet registry, rates and document expiry tracking."
      queryKey="vehicles"
      resource={vehiclesApi}
      columns={columns}
      fields={fields}
    />
  );
}
