import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button, EmptyState, Field, Input, Modal, Select } from './ui';

function FormField({ field, value, onChange }) {
  const common = {
    value: value ?? '',
    onChange: (e) => onChange(field.name, e.target.value),
    required: field.required,
    placeholder: field.placeholder,
  };

  if (field.type === 'select') {
    return (
      <Select {...common}>
        <option value="">Select…</option>
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }

  return <Input type={field.type || 'text'} step={field.step} {...common} />;
}

export default function CrudPage({ title, description, queryKey, resource, columns, fields, searchable = true }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const { data = [], isLoading } = useQuery({
    queryKey: [queryKey, search],
    queryFn: () => resource.list(searchable ? { search } : undefined),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  const createMutation = useMutation({
    mutationFn: resource.create,
    onSuccess: () => {
      toast.success(`${title.slice(0, -1)} created`);
      invalidate();
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => resource.update(id, data),
    onSuccess: () => {
      toast.success(`${title.slice(0, -1)} updated`);
      invalidate();
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const removeMutation = useMutation({
    mutationFn: resource.remove,
    onSuccess: () => {
      toast.success(`${title.slice(0, -1)} deleted`);
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  });

  function openCreate() {
    setEditing(null);
    setForm({});
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    const initial = {};
    fields.forEach((f) => {
      initial[f.name] = f.transformIn ? f.transformIn(row[f.name]) : row[f.name];
    });
    setForm(initial);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm({});
  }

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {};
    fields.forEach((f) => {
      const raw = form[f.name];
      payload[f.name] = f.transformOut ? f.transformOut(raw) : raw;
    });
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <Button onClick={openCreate}>+ Add {title.slice(0, -1)}</Button>
      </div>

      {searchable && (
        <div className="mb-4">
          <Input
            placeholder={`Search ${title.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left font-semibold text-slate-500">
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate-700">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => openEdit(row)} className="mr-3 text-brand-600 hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete this ${title.toLowerCase().slice(0, -1)}?`)) removeMutation.mutate(row.id);
                    }}
                    className="text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && data.length === 0 && <EmptyState message={`No ${title.toLowerCase()} yet.`} />}
        {isLoading && <EmptyState message="Loading…" />}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              <FormField field={f} value={form[f.name]} onChange={handleChange} />
            </Field>
          ))}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
