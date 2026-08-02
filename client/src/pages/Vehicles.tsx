import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { vehiclesApi } from '../api/endpoints';
import { CrudListPage, type FormFieldSpec } from '../components/CrudListPage';
import { Badge, PlateBadge } from '../components/ui';
import type { Vehicle } from '../types/domain';

const columns: ColumnDef<Vehicle, any>[] = [
  { header: 'Registration', cell: (c) => <PlateBadge value={c.row.original.registrationNumber} /> },
  { header: 'Make / Model', accessorFn: (r) => `${r.make} ${r.model} (${r.year})` },
  { header: 'Seats', accessorKey: 'seats' },
  { header: 'Odometer', accessorFn: (r) => `${r.currentOdometer.toLocaleString()} km` },
  { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
];

const formFields: FormFieldSpec[] = [
  { name: 'categoryId', label: 'Category ID', required: true },
  { name: 'registrationNumber', label: 'Registration Number', required: true },
  { name: 'make', label: 'Make', required: true },
  { name: 'model', label: 'Model', required: true },
  { name: 'year', label: 'Year', type: 'number', required: true },
  { name: 'fuelType', label: 'Fuel Type', type: 'select', required: true, options: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'].map((v) => ({ value: v, label: v })) },
  { name: 'transmission', label: 'Transmission', type: 'select', required: true, options: ['MANUAL', 'AUTOMATIC'].map((v) => ({ value: v, label: v })) },
  { name: 'seats', label: 'Seats', type: 'number', required: true },
  { name: 'status', label: 'Status', type: 'select', options: ['AVAILABLE', 'DEPLOYED', 'ON_TRIP', 'IN_MAINTENANCE', 'BLOCKED', 'RETIRED'].map((v) => ({ value: v, label: v })) },
];

const schema = z.object({
  categoryId: z.string().min(1),
  registrationNumber: z.string().min(4),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1980),
  fuelType: z.string().min(1, 'Required'),
  transmission: z.string().min(1, 'Required'),
  seats: z.coerce.number().int().min(1),
  status: z.string().optional(),
});

export default function Vehicles() {
  return (
    <CrudListPage
      title="Vehicles"
      description="Fleet registry, rates and document expiry tracking."
      queryKey="vehicles"
      resource={vehiclesApi}
      columns={columns}
      formFields={formFields}
      formSchema={schema}
    />
  );
}
