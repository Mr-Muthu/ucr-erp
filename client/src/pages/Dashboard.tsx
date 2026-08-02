import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { dashboardApi } from '../api/endpoints';
import { Badge, Card, EmptyState, Money, PlateBadge } from '../components/ui';
import { formatDateTime } from '../lib/format';

const DUTY_STATUS_ORDER = ['ASSIGNED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'SUBMITTED', 'DISPUTED'];
const CHART_COLORS = ['#1a67f5', '#f59e0b'];

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.summary, refetchInterval: 60_000 });

  if (isLoading || !data) return <EmptyState message="Loading dashboard…" />;

  const chartData = [
    { name: 'B2B (Vendor + Fixed-Duty)', value: data.mtdRevenue.b2b },
    { name: 'B2C (Retail)', value: data.mtdRevenue.b2c },
  ];

  const alertEntries: Array<{ label: string; value: number; to: string }> = [
    { label: 'Documents expiring ≤30d', value: data.alerts.expiringDocuments, to: '/vehicles' },
    { label: 'Licenses expiring ≤30d', value: data.alerts.expiringLicenses, to: '/drivers' },
    { label: 'Disputed duties', value: data.alerts.disputedDuties, to: '/duties?status=DISPUTED' },
    { label: 'Unbilled approved duties', value: data.alerts.unbilledApprovedDuties, to: '/duties?status=APPROVED' },
    { label: 'Overdue invoices', value: data.alerts.overdueInvoices, to: '/invoices?status=OVERDUE' },
    { label: 'Maintenance due soon', value: data.alerts.maintenanceDue, to: '/maintenance' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Command Dashboard</h1>

      {/* Duties today — actionable queues, not just counts */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Duties Today ({data.dutiesToday.total})</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {DUTY_STATUS_ORDER.map((status) => (
            <Link
              key={status}
              to={`/duties?status=${status}`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="mr-2 font-semibold text-slate-700">{data.dutiesToday.byStatus[status] ?? 0}</span>
              <Badge value={status} />
            </Link>
          ))}
        </div>
        {data.dutiesToday.items.length === 0 ? (
          <EmptyState message="No duties scheduled today." />
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Scheduled</th>
                <th className="py-2 pr-4">Vehicle</th>
                <th className="py-2 pr-4">Driver</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.dutiesToday.items.map((duty: any) => (
                <tr key={duty.id}>
                  <td className="py-2 pr-4">{formatDateTime(duty.scheduledStart)}</td>
                  <td className="py-2 pr-4">{duty.vehicle && <PlateBadge value={duty.vehicle.registrationNumber} />}</td>
                  <td className="py-2 pr-4">{duty.driver?.name}</td>
                  <td className="py-2 pr-4">{duty.vendor?.companyName ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <Badge value={duty.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Deployment board */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Deployment Board — vehicle × counterparty</h2>
          {data.deploymentBoard.length === 0 ? (
            <EmptyState message="No active deployments." />
          ) : (
            <ul className="space-y-2">
              {data.deploymentBoard.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    {d.vehicle ? <PlateBadge value={d.vehicle} /> : <span className="text-slate-400">unassigned</span>}
                    <span className="text-slate-600">{d.counterpartyName}</span>
                  </div>
                  <Badge value={d.counterpartyType} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* MTD revenue */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Month-to-Date Revenue — <Money value={data.mtdRevenue.total} /></h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Alerts */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Alerts</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {alertEntries.map((alert) => (
            <Link
              key={alert.label}
              to={alert.to}
              className={`rounded-lg border px-3 py-3 text-center ${
                alert.value > 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${alert.value > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{alert.value}</div>
              <div className="mt-1 text-xs text-slate-500">{alert.label}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
