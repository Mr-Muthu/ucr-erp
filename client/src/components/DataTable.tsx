import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { Button, EmptyState } from './ui';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  exportFilename?: string;
  onRowClick?: (row: T) => void;
  pagination?: {
    hasNext: boolean;
    hasPrev: boolean;
    onNext: () => void;
    onPrev: () => void;
  };
}

/** Server-side-everything table per the module-list spec: cursor pagination, XLSX export of exactly what's on screen. */
export function DataTable<T>({ columns, data, isLoading, emptyMessage = 'No records found.', exportFilename, onRowClick, pagination }: DataTableProps<T>) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  function exportXlsx() {
    const rows = data.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const header = typeof col.header === 'string' ? col.header : (col as any).id ?? '';
        const accessorFn = (col as any).accessorFn;
        const accessorKey = (col as any).accessorKey;
        out[header] = accessorFn ? accessorFn(row) : accessorKey ? (row as any)[accessorKey] : '';
      }
      return out;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Export');
    XLSX.writeFile(workbook, `${exportFilename ?? 'export'}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {exportFilename && (
        <div className="flex justify-end border-b border-slate-100 px-4 py-2">
          <Button variant="secondary" onClick={exportXlsx} disabled={data.length === 0}>
            Export XLSX
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-500">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : undefined} onClick={() => onRowClick?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <EmptyState message="Loading…" />}
        {!isLoading && data.length === 0 && <EmptyState message={emptyMessage} />}
      </div>
      {pagination && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2">
          <Button variant="secondary" disabled={!pagination.hasPrev} onClick={pagination.onPrev}>
            ← Previous
          </Button>
          <Button variant="secondary" disabled={!pagination.hasNext} onClick={pagination.onNext}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
