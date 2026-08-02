import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { rateCardsApi, settingsApi } from '../api/endpoints';
import { extractApiError } from '../api/client';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';
import { RoleGate } from '../components/RoleGate';

const ROLE_POLICY = [
  { role: 'OWNER', can: 'Everything, including voiding invoices and overriding expired documents/licenses.' },
  { role: 'MANAGER', can: 'Fleet, bookings, duties, vendors, rate cards, finalize reconciliations/invoices — cannot void.' },
  { role: 'OPS', can: 'Fleet, bookings, duties day-to-day — cannot void or manage money beyond recording.' },
  { role: 'ACCOUNTS', can: 'Money — expenses, payments, invoice finalize/payments — cannot edit fleet.' },
  { role: 'VIEWER', can: 'Read-only everywhere.' },
];

function SettingRow({ setting }: { setting: { id: string; key: string; value: unknown; description?: string } }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(JSON.stringify(setting.value, null, 2));

  const mutation = useMutation({
    mutationFn: () => settingsApi.update(setting.key, JSON.parse(text)),
    onSuccess: () => {
      toast.success('Setting updated');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
    },
    onError: (err) => toast.error(extractApiError(err).message || 'Invalid JSON'),
  });

  return (
    <div className="border-b border-slate-100 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-sm font-semibold text-slate-700">{setting.key}</div>
          {setting.description && <div className="text-xs text-slate-500">{setting.description}</div>}
        </div>
        <RoleGate roles={['OWNER']}>
          <button className="shrink-0 text-xs text-brand-600 hover:underline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </RoleGate>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save
          </Button>
        </div>
      ) : (
        <pre className="mt-2 rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{JSON.stringify(setting.value)}</pre>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: settings = [], isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.list });
  const { data: rateCards = [] } = useQuery({ queryKey: ['rate-cards-all'], queryFn: () => rateCardsApi.list() });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Business numbers, tax defaults, numbering, and role permissions — never hardcoded in the app." />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Role Permissions</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {ROLE_POLICY.map((r) => (
              <tr key={r.role}>
                <td className="py-2 pr-4 font-semibold">{r.role}</td>
                <td className="py-2 text-slate-600">{r.can}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Business Settings</h2>
        {isLoading ? <EmptyState message="Loading…" /> : settings.map((s) => <SettingRow key={s.id} setting={s} />)}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Retail Rate Cards</h2>
        {rateCards.length === 0 ? (
          <EmptyState message="No retail rate cards yet." />
        ) : (
          <ul className="space-y-1 text-sm">
            {rateCards.map((rc) => (
              <li key={rc.id} className="flex justify-between border-b border-slate-100 py-1.5">
                <span>{rc.type}</span>
                <span className="text-slate-400">{rc.items.length} item(s)</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
