import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { maintenanceApi } from '../api/endpoints';
import { CrudListPage, type FormFieldSpec } from '../components/CrudListPage';
import { Badge, Money } from '../components/ui';
import { formatDate } from '../lib/format';
import type { MaintenanceJob } from '../types/domain';

const columns: ColumnDef<MaintenanceJob, any>[] = [
  { header: 'Vehicle ID', accessorKey: 'vehicleId' },
  { header: 'Type', accessorKey: 'type' },
  { header: 'Description', accessorKey: 'description' },
  { header: 'Cost', cell: (c) => <Money value={c.row.original.cost} /> },
  { header: 'Service date', accessorFn: (r) => formatDate(r.serviceDate) },
  { header: 'Next due', accessorFn: (r) => formatDate(r.nextDueDate) },
  { header: 'Status', accessorKey: 'status', cell: (c) => <Badge value={c.getValue()} /> },
];

const formFields: FormFieldSpec[] = [
  { name: 'vehicleId', label: 'Vehicle ID', required: true },
  { name: 'type', label: 'Type', type: 'select', options: [{ value: 'SCHEDULED', label: 'Scheduled' }, { value: 'BREAKDOWN', label: 'Breakdown' }] },
  { name: 'description', label: 'Description', required: true },
  { name: 'cost', label: 'Cost (₹)', type: 'number' },
  { name: 'serviceDate', label: 'Service date', type: 'date' },
  { name: 'nextDueDate', label: 'Next due date', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', options: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((v) => ({ value: v, label: v })) },
];

const schema = z.object({
  vehicleId: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  cost: z.coerce.number().optional(),
  serviceDate: z.string().optional(),
  nextDueDate: z.string().optional(),
  status: z.string().optional(),
});

export default function Maintenance() {
  return (
    <CrudListPage
      title="Maintenance"
      description="Scheduled service and breakdown jobs."
      queryKey="maintenance"
      resource={maintenanceApi}
      columns={columns}
      formFields={formFields}
      formSchema={schema}
      searchable={false}
    />
  );
}
