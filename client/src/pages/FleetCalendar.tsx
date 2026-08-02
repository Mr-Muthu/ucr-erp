import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vehiclesApi, deploymentsApi, bookingsApi, maintenanceApi } from '../api/endpoints';
import { Button, EmptyState, PageHeader, PlateBadge } from '../components/ui';
import { formatDate } from '../lib/format';

const DAY_MS = 86_400_000;
const VISIBLE_DAYS = 14;

interface Bar {
  key: string;
  kind: 'deployment' | 'booking' | 'maintenance';
  label: string;
  start: number; // ms epoch
  end: number;
}

const KIND_STYLE: Record<Bar['kind'], string> = {
  deployment: 'bg-brand-500',
  booking: 'bg-emerald-500',
  maintenance: 'bg-red-500',
};

export default function FleetCalendar() {
  const [windowStart, setWindowStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const windowEnd = new Date(windowStart.getTime() + VISIBLE_DAYS * DAY_MS);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles-calendar'],
    queryFn: () => vehiclesApi.list({ limit: 100 }),
    select: (r: any) => r.data,
  });
  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments-calendar'],
    queryFn: () => deploymentsApi.list({ limit: 200, status: 'ACTIVE' }),
    select: (r: any) => r.data,
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-calendar'],
    queryFn: () => bookingsApi.list({ limit: 200 }),
    select: (r: any) => r.data,
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ['maintenance-calendar'],
    queryFn: () => maintenanceApi.list({ limit: 200 }),
    select: (r: any) => r.data,
  });

  const barsByVehicle = useMemo(() => {
    const map = new Map<string, Bar[]>();

    for (const d of deployments as any[]) {
      for (const seg of d.vehicleSegments ?? []) {
        const start = new Date(seg.startDate).getTime();
        const end = seg.endDate ? new Date(seg.endDate).getTime() : windowEnd.getTime() + DAY_MS;
        const list = map.get(seg.vehicleId) ?? [];
        list.push({ key: seg.id, kind: 'deployment', label: d.vendor?.companyName ?? d.customer?.name ?? 'Deployment', start, end });
        map.set(seg.vehicleId, list);
      }
    }

    for (const b of bookings as any[]) {
      if (!b.vehicleId || !['CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS'].includes(b.status)) continue;
      const start = new Date(b.pickupDateTime).getTime();
      const end = b.dropDateTime ? new Date(b.dropDateTime).getTime() : start + DAY_MS;
      const list = map.get(b.vehicleId) ?? [];
      list.push({ key: b.id, kind: 'booking', label: b.bookingNumber, start, end });
      map.set(b.vehicleId, list);
    }

    for (const m of maintenance as any[]) {
      if (!['OPEN', 'IN_PROGRESS'].includes(m.status)) continue;
      const start = m.serviceDate ? new Date(m.serviceDate).getTime() : windowStart.getTime();
      const end = start + DAY_MS;
      const list = map.get(m.vehicleId) ?? [];
      list.push({ key: m.id, kind: 'maintenance', label: m.description, start, end });
      map.set(m.vehicleId, list);
    }

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployments, bookings, maintenance]);

  const totalSpan = windowEnd.getTime() - windowStart.getTime();

  return (
    <div>
      <PageHeader
        title="Fleet Calendar"
        description="One row per vehicle — deployments, bookings, and maintenance across the visible window."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setWindowStart(new Date(windowStart.getTime() - VISIBLE_DAYS * DAY_MS))}>
              ← Previous
            </Button>
            <Button variant="secondary" onClick={() => setWindowStart(new Date())}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => setWindowStart(new Date(windowStart.getTime() + VISIBLE_DAYS * DAY_MS))}>
              Next →
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> Deployment
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Booking
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Maintenance
        </span>
        <span className="ml-auto font-medium text-slate-700">
          {formatDate(windowStart.toISOString())} – {formatDate(new Date(windowEnd.getTime() - DAY_MS).toISOString())}
        </span>
      </div>

      {isLoading ? (
        <EmptyState message="Loading fleet…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            {/* Day gridlines header */}
            <div className="flex border-b border-slate-200 pl-40">
              {Array.from({ length: VISIBLE_DAYS }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-slate-100 py-1 text-center text-[10px] text-slate-400">
                  {formatDate(new Date(windowStart.getTime() + i * DAY_MS).toISOString()).slice(0, 6)}
                </div>
              ))}
            </div>

            {vehicles.map((vehicle: any) => {
              const bars = (barsByVehicle.get(vehicle.id) ?? []).filter((b) => b.end > windowStart.getTime() && b.start < windowEnd.getTime());
              return (
                <div key={vehicle.id} className="flex items-center border-b border-slate-100 last:border-b-0">
                  <div className="w-40 shrink-0 px-3 py-2">
                    <PlateBadge value={vehicle.registrationNumber} />
                  </div>
                  <div className="relative h-10 flex-1">
                    {bars.map((bar) => {
                      const clippedStart = Math.max(bar.start, windowStart.getTime());
                      const clippedEnd = Math.min(bar.end, windowEnd.getTime());
                      const left = ((clippedStart - windowStart.getTime()) / totalSpan) * 100;
                      const width = Math.max(((clippedEnd - clippedStart) / totalSpan) * 100, 1);
                      return (
                        <div
                          key={bar.key}
                          title={bar.label}
                          className={`absolute top-1.5 h-7 truncate rounded px-1.5 text-[10px] leading-7 text-white ${KIND_STYLE[bar.kind]}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          {bar.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {vehicles.length === 0 && <EmptyState message="No vehicles in fleet." />}
          </div>
        </div>
      )}
    </div>
  );
}
