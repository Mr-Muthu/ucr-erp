import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bookingsApi, customersApi, driversApi, vehiclesApi } from '../api/resources';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '../components/ui';

const STATUS_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ONGOING', 'CANCELLED'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function toDatetimeLocal(d) {
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function NewBookingModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ rateType: 'DAILY' });

  const { data: customers = [] } = useQuery({ queryKey: ['customers-all'], queryFn: () => customersApi.list(), enabled: open });
  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles-all'], queryFn: () => vehiclesApi.list(), enabled: open });
  const { data: drivers = [] } = useQuery({ queryKey: ['drivers-all'], queryFn: () => driversApi.list(), enabled: open });

  const availableVehicles = useMemo(() => vehicles.filter((v) => v.status !== 'OUT_OF_SERVICE'), [vehicles]);
  const activeDrivers = useMemo(() => drivers.filter((d) => d.status !== 'INACTIVE'), [drivers]);
  const selectedVehicle = vehicles.find((v) => v.id === form.vehicleId);

  const createMutation = useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: () => {
      toast.success('Booking created');
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setForm({ rateType: 'DAILY' });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create booking'),
  });

  function update(name, value) {
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if ((name === 'vehicleId' || name === 'rateType') && next.vehicleId) {
        const v = vehicles.find((x) => x.id === next.vehicleId);
        if (v) next.rateAmount = next.rateType === 'HOURLY' ? v.hourlyRate ?? v.dailyRate : v.dailyRate;
      }
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.customerId || !form.vehicleId || !form.pickupDateTime || !form.dropDateTime || !form.rateAmount) {
      toast.error('Please fill all required fields');
      return;
    }
    createMutation.mutate({
      ...form,
      driverId: form.driverId || null,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New Booking" wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Customer *">
          <Select value={form.customerId || ''} onChange={(e) => update('customerId', e.target.value)} required>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.phone}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle *">
          <Select value={form.vehicleId || ''} onChange={(e) => update('vehicleId', e.target.value)} required>
            <option value="">Select vehicle…</option>
            {availableVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.regNumber} — {v.make} {v.model} ({v.status})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Driver (optional)">
          <Select value={form.driverId || ''} onChange={(e) => update('driverId', e.target.value)}>
            <option value="">Self-drive / unassigned</option>
            {activeDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.phone}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate Type">
          <Select value={form.rateType || 'DAILY'} onChange={(e) => update('rateType', e.target.value)}>
            <option value="DAILY">Daily</option>
            <option value="HOURLY">Hourly</option>
            <option value="TRIP">Flat / Trip</option>
          </Select>
        </Field>
        <Field label="Pickup Location *">
          <Input value={form.pickupLocation || ''} onChange={(e) => update('pickupLocation', e.target.value)} required />
        </Field>
        <Field label="Drop Location">
          <Input value={form.dropLocation || ''} onChange={(e) => update('dropLocation', e.target.value)} />
        </Field>
        <Field label="Pickup Date & Time *">
          <Input
            type="datetime-local"
            value={form.pickupDateTime ? toDatetimeLocal(form.pickupDateTime) : ''}
            onChange={(e) => update('pickupDateTime', e.target.value)}
            required
          />
        </Field>
        <Field label="Drop Date & Time *">
          <Input
            type="datetime-local"
            value={form.dropDateTime ? toDatetimeLocal(form.dropDateTime) : ''}
            onChange={(e) => update('dropDateTime', e.target.value)}
            required
          />
        </Field>
        <Field label={`Rate Amount (₹) *${selectedVehicle ? ` — vehicle default shown` : ''}`}>
          <Input type="number" step="0.01" value={form.rateAmount || ''} onChange={(e) => update('rateAmount', e.target.value)} required />
        </Field>
        <Field label="Advance Paid (₹)">
          <Input type="number" step="0.01" value={form.advanceAmount || ''} onChange={(e) => update('advanceAmount', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <Input value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2 mt-3 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create Booking'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Bookings() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', statusFilter],
    queryFn: () => bookingsApi.list(statusFilter ? { status: statusFilter } : undefined),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, odometer }) => bookingsApi.updateStatus(id, status, odometer),
    onSuccess: () => {
      toast.success('Booking updated');
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update booking'),
  });

  function handleStatusChange(booking, status) {
    let odometer;
    if (status === 'ONGOING' || status === 'COMPLETED') {
      const label = status === 'ONGOING' ? 'Starting odometer (km)' : 'Ending odometer (km)';
      const value = window.prompt(label, booking.vehicle?.odometer ?? '');
      if (value === null) return;
      odometer = value ? Number(value) : undefined;
    } else if (status === 'CANCELLED' && !window.confirm('Cancel this booking?')) {
      return;
    }
    statusMutation.mutate({ id: booking.id, status, odometer });
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bookings</h1>
          <p className="text-sm text-slate-500">Reservations, availability and trip status.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ New Booking</Button>
      </div>

      <div className="mb-4 flex gap-2">
        {['', 'PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((s) => (
          <button
            key={s || 'ALL'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-300'
            }`}
          >
            {s || 'ALL'}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="px-4 py-3">Booking #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">Pickup</th>
              <th className="px-4 py-3">Drop</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{b.bookingNumber}</td>
                <td className="px-4 py-3">{b.customer?.name}</td>
                <td className="px-4 py-3">{b.vehicle?.regNumber}</td>
                <td className="px-4 py-3">{b.driver?.name || '—'}</td>
                <td className="px-4 py-3">{new Date(b.pickupDateTime).toLocaleString()}</td>
                <td className="px-4 py-3">{new Date(b.dropDateTime).toLocaleString()}</td>
                <td className="px-4 py-3">₹{Number(b.totalAmount).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Badge value={b.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {STATUS_FLOW[b.status]?.map((next) => (
                    <button
                      key={next}
                      onClick={() => handleStatusChange(b, next)}
                      className="ml-2 text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {next === 'CONFIRMED' && 'Confirm'}
                      {next === 'ONGOING' && 'Start Trip'}
                      {next === 'COMPLETED' && 'Complete'}
                      {next === 'CANCELLED' && 'Cancel'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && bookings.length === 0 && <EmptyState message="No bookings found." />}
      </Card>

      <NewBookingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
