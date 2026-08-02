import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { formatMoney } from '../lib/format';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      className={clsx(
        'rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={clsx(
        'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
        props.className
      )}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return (
    <select
      ref={ref}
      {...props}
      className={clsx(
        'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
        props.className
      )}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={clsx(
        'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
        props.className
      )}
    />
  );
});

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/** Money is always right-aligned, tabular-numeral — the one UX standard applied everywhere a number represents currency. */
export function Money({ value, className }: { value: string | number | undefined | null; className?: string }) {
  return <span className={clsx('money-cell inline-block', className)}>{formatMoney(value)}</span>;
}

const BADGE_TONES: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  CONFIRMED: 'bg-brand-100 text-brand-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  ACCEPTED: 'bg-brand-100 text-brand-700',
  ASSIGNED: 'bg-slate-200 text-slate-700',
  STARTED: 'bg-amber-100 text-amber-700',
  ON_TRIP: 'bg-amber-100 text-amber-700',
  DEPLOYED: 'bg-brand-100 text-brand-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DUTY_ASSIGNED: 'bg-amber-100 text-amber-700',
  SUBMITTED: 'bg-brand-100 text-brand-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-emerald-100 text-emerald-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  ISSUED: 'bg-brand-100 text-brand-700',
  BILLED: 'bg-emerald-100 text-emerald-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  IN_MAINTENANCE: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-slate-200 text-slate-700',
  STATEMENT_SENT: 'bg-brand-100 text-brand-700',
  PENDING: 'bg-slate-200 text-slate-700',
  QUOTED: 'bg-slate-200 text-slate-700',
  INQUIRY: 'bg-slate-200 text-slate-700',
  ON_LEAVE: 'bg-slate-200 text-slate-700',
  DISPUTED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-red-100 text-red-700',
  DECLINED: 'bg-red-100 text-red-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-red-100 text-red-700',
  RETIRED: 'bg-slate-200 text-slate-700',
  INACTIVE: 'bg-slate-200 text-slate-700',
  BLACKLISTED: 'bg-red-100 text-red-700',
  RESOLVED: 'bg-brand-100 text-brand-700',
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE_TONES[value] ?? 'bg-slate-200 text-slate-700')}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}

/** Indian vehicle registration numbers rendered as a plate — the one visual motif used everywhere a registration number appears. */
export function PlateBadge({ value }: { value: string }) {
  return (
    <span className="inline-block rounded border-2 border-slate-800 bg-yellow-50 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-slate-900">
      {value}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{message}</div>;
}

export function Spinner() {
  return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={clsx('max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Typed confirmation for destructive actions (void invoice, deactivate
 * driver, delete records) — requires the user to type the exact phrase
 * before the confirm button enables, per the UX standard.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmPhrase,
  confirmLabel = 'Confirm',
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmPhrase: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const matches = typed.trim() === confirmPhrase;

  return (
    <Modal
      open={open}
      onClose={() => {
        setTyped('');
        onClose();
      }}
      title={title}
    >
      <p className="mb-4 text-sm text-slate-600">{description}</p>
      <Field label={`Type "${confirmPhrase}" to confirm`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setTyped('');
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          disabled={!matches}
          onClick={() => {
            onConfirm();
            setTyped('');
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
