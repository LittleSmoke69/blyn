import { X, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-green text-white font-semibold px-4 py-2 text-sm hover:bg-green-dark transition-colors disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card font-medium px-4 py-2 text-sm hover:border-green transition-colors disabled:opacity-50";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl flex items-center gap-2">
          {Icon && <Icon className="h-6 w-6 text-green" />}
          {title}
        </h1>
        {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-14 text-center">
      <Icon className="h-10 w-10 text-muted mx-auto mb-3" />
      <p className="font-semibold">{title}</p>
      {description && <p className="text-sm text-muted mt-1">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  valueClassName,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="text-sm text-muted mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueClassName ?? ""}`}>{value}</p>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} bg-card rounded-2xl border border-border shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg text-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mb-6 rounded-xl border border-red/30 bg-red/5 text-red text-sm p-4">{message}</div>;
}

export function PillTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
            value === o.key ? "bg-green text-white border-green" : "border-border text-muted hover:border-green"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
