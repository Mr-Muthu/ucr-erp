import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ColumnDef } from '@tanstack/react-table';
import type { ZodTypeAny } from 'zod';
import { extractApiError } from '../api/client';
import { DataTable } from './DataTable';
import { Button, Field, Input, Modal, PageHeader, Select } from './ui';
import { useCursorPagination } from '../lib/useCursorPagination';
import { useAuth } from '../auth/AuthContext';

export interface FormFieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'email';
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
}

interface CrudListPageProps<T> {
  title: string;
  description?: string;
  queryKey: string;
  resource: {
    list: (params?: Record<string, unknown>) => Promise<{ data: T[]; meta: { nextCursor: string | null } }>;
    create: (data: unknown) => Promise<T>;
    update: (id: string, data: unknown) => Promise<T>;
  };
  columns: ColumnDef<T, any>[];
  formFields: FormFieldSpec[];
  formSchema: ZodTypeAny;
  searchable?: boolean;
  extraFilters?: Record<string, unknown>;
  canWrite?: boolean;
  onRowClick?: (row: T) => void;
}

export function CrudListPage<T extends { id: string }>({
  title,
  description,
  queryKey,
  resource,
  columns,
  formFields,
  formSchema,
  searchable = true,
  extraFilters,
  canWrite = true,
  onRowClick,
}: CrudListPageProps<T>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const { cursor, hasPrev, goNext, goPrev } = useCursorPagination();

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, search, cursor, extraFilters],
    queryFn: () => resource.list({ ...(searchable ? { search: search || undefined } : {}), cursor, limit: 20, ...extraFilters }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(formSchema) });

  const createMutation = useMutation({
    mutationFn: resource.create,
    onSuccess: () => {
      toast.success(`${title.slice(0, -1)} created`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      closeModal();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => resource.update(id, data),
    onSuccess: () => {
      toast.success(`${title.slice(0, -1)} updated`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      closeModal();
    },
    onError: (err) => toast.error(extractApiError(err).message),
  });

  function openCreate() {
    setEditing(null);
    reset({});
    setModalOpen(true);
  }
  function openEdit(row: T) {
    setEditing(row);
    reset(row as any);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }
  function onSubmit(values: any) {
    // Unselected <select> fields (and blanked-out optional inputs) submit as '' — the
    // server treats optional fields as absent, not as an empty string, so normalize here.
    const cleaned = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? undefined : v]));
    // branchId is never a visible field — every staff account is scoped to one branch,
    // so the record is always created under the logged-in user's own branch.
    const payload = { branchId: user?.branchId, ...cleaned };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  const columnsWithEdit: ColumnDef<T, any>[] = canWrite
    ? [
        ...columns,
        {
          header: '',
          id: 'edit',
          cell: (c) => (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEdit(c.row.original);
              }}
              className="text-brand-600 hover:underline"
            >
              Edit
            </button>
          ),
        },
      ]
    : columns;

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={canWrite ? <Button onClick={openCreate}>+ Add {title.slice(0, -1)}</Button> : undefined}
      />
      {searchable && (
        <div className="mb-4">
          <Input placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
      )}
      <DataTable
        columns={columnsWithEdit}
        data={data?.data ?? []}
        isLoading={isLoading}
        exportFilename={title.toLowerCase()}
        onRowClick={onRowClick}
        pagination={{ hasNext: Boolean(data?.meta.nextCursor), hasPrev, onNext: () => goNext(data?.meta.nextCursor ?? null), onPrev: goPrev }}
      />

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`} wide>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          {formFields.map((f) => (
            <Field key={f.name} label={f.label} error={(errors as any)[f.name]?.message}>
              {f.type === 'select' ? (
                <Select {...register(f.name)}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input type={f.type ?? 'text'} {...register(f.name)} />
              )}
            </Field>
          ))}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
