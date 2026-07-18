import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/resources';
import { Badge, Card, EmptyState, StatCard } from '../components/ui';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.summary });

  if (isLoading || !data) {
    return <EmptyState message="Loading dashboard…" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Fleet" value={data.fleet.total} hint={`${data.fleet.available} available`} tone="blue" />
        <StatCard label="Vehicles Booked" value={data.fleet.booked} tone="amber" />
        <StatCard label="In Maintenance" value={data.fleet.inMaintenance} tone="amber" />
        <StatCard label="Active Bookings" value={data.bookings.active} hint={`${data.bookings.pending} pending`} tone="blue" />
        <StatCard label="Drivers" value={data.drivers} tone="slate" />
        <StatCard label="Customers" value={data.customers} tone="slate" />
        <StatCard label="Unpaid Invoices" value={data.billing.unpaidInvoices} tone="red" />
        <StatCard
          label="Total Revenue Collected"
          value={`₹${Number(data.billing.totalRevenue).toLocaleString()}`}
          tone="green"
        />
      </div>

      {data.expiringDocuments > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.expiringDocuments} vehicle document(s) expiring within 30 days.{' '}
          <Link to="/vehicles" className="font-semibold underline">
            Review fleet
          </Link>
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Recent Bookings</h2>
        {data.recentBookings.length === 0 ? (
          <EmptyState message="No bookings yet." />
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Booking #</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Vehicle</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recentBookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-4 font-medium text-slate-700">{b.bookingNumber}</td>
                  <td className="py-2 pr-4">{b.customer?.name}</td>
                  <td className="py-2 pr-4">
                    {b.vehicle?.regNumber} — {b.vehicle?.make} {b.vehicle?.model}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge value={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
