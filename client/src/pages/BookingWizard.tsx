import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { availabilityApi, bookingsApi, customersApi, driversApi, rateCardsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Badge, Button, Card, Field, Input, Money, PageHeader, PlateBadge, Select } from '../components/ui';
import type { BookingType, RateCardItem } from '../types/domain';

type PackageType = BookingType;

function estimateQuote(type: PackageType, item: RateCardItem | undefined, outstationDays: number): number {
  if (!item) return 0;
  if (type === 'LOCAL_PACKAGE') return Number(item.slabBaseRate ?? 0);
  if (type === 'OUTSTATION') {
    const floorKm = (item.minKmPerDay ?? 0) * outstationDays;
    return floorKm * Number(item.perKmRate ?? 0) + Number(item.driverBattaPerDay ?? 0) * outstationDays;
  }
  return Number(item.flatRate ?? 0);
}

export default function BookingWizard() {
  const queryClient = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState<PackageType>('LOCAL_PACKAGE');
  const [rateCardItemId, setRateCardItemId] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [pickupDateTime, setPickupDateTime] = useState('');
  const [dropDateTime, setDropDateTime] = useState('');
  const [outstationDays, setOutstationDays] = useState(1);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [vehicleId, setVehicleId] = useState('');
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [driverId, setDriverId] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => customersApi.list({ search: customerSearch || undefined, limit: 20 }),
    select: (r: any) => r.data,
  });
  const { data: rateCards = [] } = useQuery({ queryKey: ['rate-cards', type], queryFn: () => rateCardsApi.list({ type }) });
  const allItems = rateCards.flatMap((rc) => rc.items);
  const selectedItem = allItems.find((i) => i.id === rateCardItemId);

  const { data: availability } = useQuery({
    queryKey: ['availability', selectedItem?.categoryId, pickupDateTime, dropDateTime],
    queryFn: () => availabilityApi.check(selectedItem!.categoryId, new Date(pickupDateTime).toISOString(), new Date(dropDateTime || pickupDateTime).toISOString()),
    enabled: Boolean(selectedItem && pickupDateTime && dropDateTime),
  });

  const { data: drivers = [] } = useQuery({ queryKey: ['drivers-all'], queryFn: () => driversApi.list({ limit: 100 }), select: (r: any) => r.data });

  const estimate = estimateQuote(type, selectedItem, outstationDays);

  const createBooking = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        branchId: customers.find((c: any) => c.id === customerId)?.branchId,
        customerId,
        type,
        rateCardItemId,
        pickupLocation,
        dropLocation: dropLocation || undefined,
        pickupDateTime: new Date(pickupDateTime).toISOString(),
        dropDateTime: dropDateTime ? new Date(dropDateTime).toISOString() : undefined,
        outstationDays: type === 'OUTSTATION' ? outstationDays : undefined,
        vehicleId: vehicleId || undefined,
        advanceAmount,
      }),
    onSuccess: (booking) => {
      toast.success(`Booking ${booking.bookingNumber} created`);
      setCreatedBooking(booking);
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  const confirmBooking = useMutation({
    mutationFn: () => bookingsApi.transition(createdBooking.id, 'confirm', { vehicleId }),
    onSuccess: (updated) => {
      toast.success('Booking confirmed — vehicle held');
      setCreatedBooking(updated);
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  const assignDuty = useMutation({
    mutationFn: () => bookingsApi.transition(createdBooking.id, 'assignDuty', { driverId }),
    onSuccess: (result) => {
      toast.success('Duty assigned to driver');
      setCreatedBooking(result.booking);
      queryClient.invalidateQueries({ queryKey: ['duties'] });
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Chauffeur Booking" description="Local slab, outstation, or airport transfer — book, confirm, and assign in one flow." />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">1. Customer</h2>
        <Input placeholder="Search by name or phone…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="mb-2" />
        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
          {customers.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCustomerId(c.id)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${customerId === c.id ? 'bg-brand-50' : ''}`}
            >
              {c.name} — {c.phone}
            </button>
          ))}
        </div>
        {customerId && <p className="mt-2 text-xs text-emerald-600">Selected: {customers.find((c: any) => c.id === customerId)?.name}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">2. Package</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => { setType(e.target.value as PackageType); setRateCardItemId(''); }}>
              <option value="LOCAL_PACKAGE">Local Package</option>
              <option value="OUTSTATION">Outstation</option>
              <option value="AIRPORT_TRANSFER">Airport Transfer</option>
            </Select>
          </Field>
          <Field label="Rate">
            <Select value={rateCardItemId} onChange={(e) => setRateCardItemId(e.target.value)}>
              <option value="">Select…</option>
              {allItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.slabLabel || item.routeLabel || item.category?.name || item.id}
                </option>
              ))}
            </Select>
          </Field>
          {type === 'OUTSTATION' && (
            <Field label="Days">
              <Input type="number" min={1} value={outstationDays} onChange={(e) => setOutstationDays(Number(e.target.value))} />
            </Field>
          )}
        </div>
        {selectedItem && type === 'OUTSTATION' && (
          <p className="mt-2 text-xs text-slate-500">
            Km floor: {(selectedItem.minKmPerDay ?? 0) * outstationDays} km ({selectedItem.minKmPerDay} km/day × {outstationDays} days) — billed on whichever is
            higher, actual or floor.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">3. Trip & Availability</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pickup location">
            <Input value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
          </Field>
          <Field label="Drop location">
            <Input value={dropLocation} onChange={(e) => setDropLocation(e.target.value)} />
          </Field>
          <Field label="Pickup date & time">
            <Input type="datetime-local" value={pickupDateTime} onChange={(e) => setPickupDateTime(e.target.value)} />
          </Field>
          <Field label="Drop date & time">
            <Input type="datetime-local" value={dropDateTime} onChange={(e) => setDropDateTime(e.target.value)} />
          </Field>
        </div>
        {availability && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-slate-500">Available vehicles in this category & window:</p>
            <div className="flex flex-wrap gap-2">
              {availability.data.map((v: any) => (
                <button
                  key={v.vehicleId}
                  type="button"
                  disabled={!v.available}
                  onClick={() => setVehicleId(v.vehicleId)}
                  className={`rounded border px-2 py-1 text-xs ${vehicleId === v.vehicleId ? 'border-brand-500 bg-brand-50' : 'border-slate-200'} ${!v.available ? 'opacity-40' : ''}`}
                >
                  <PlateBadge value={v.registrationNumber} /> {!v.available && <span className="ml-1 text-red-500">busy</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">4. Estimate & Advance</h2>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
          <span className="text-sm text-slate-600">Estimated amount</span>
          <Money value={estimate} className="text-xl font-bold" />
        </div>
        <Field label="Advance amount (₹)">
          <Input type="number" min={0} value={advanceAmount} onChange={(e) => setAdvanceAmount(Number(e.target.value))} />
        </Field>
        {!createdBooking ? (
          <Button
            className="mt-4 w-full"
            disabled={!customerId || !rateCardItemId || !pickupLocation || !pickupDateTime || createBooking.isPending}
            onClick={() => createBooking.mutate()}
          >
            Create Booking
          </Button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Booking {createdBooking.bookingNumber} — <Badge value={createdBooking.status} />
            </p>
            {createdBooking.status === 'INQUIRY' && (
              <Button disabled={!vehicleId || confirmBooking.isPending} onClick={() => confirmBooking.mutate()}>
                Confirm Booking (hold vehicle)
              </Button>
            )}
            {createdBooking.status === 'CONFIRMED' && (
              <div className="flex items-end gap-2">
                <Field label="Assign driver">
                  <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                    <option value="">Select driver…</option>
                    {drivers.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button disabled={!driverId || assignDuty.isPending} onClick={() => assignDuty.mutate()}>
                  Assign Duty
                </Button>
              </div>
            )}
            {createdBooking.status === 'DUTY_ASSIGNED' && <p className="text-sm text-emerald-700">Duty created and assigned — the trip now runs through the Duty Desk.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
