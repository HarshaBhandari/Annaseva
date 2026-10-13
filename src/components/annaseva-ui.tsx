import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const normalizeStatusKey = (value?: string) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatStatusLabel = (value?: string) => {
  const normalized = normalizeStatusKey(value);
  if (!normalized) return "Unknown";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "primary" | "secondary" | "accent" | "destructive";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    accent: "bg-accent/15 text-accent-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="annaseva-card flex items-center gap-3 p-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning/30 text-warning-foreground",
    awaiting: "bg-warning/30 text-warning-foreground",
    approved: "bg-secondary/15 text-secondary",
    completed: "bg-secondary/15 text-secondary",
    verified: "bg-secondary/15 text-secondary",
    resolved: "bg-secondary/15 text-secondary",
    active: "bg-secondary/15 text-secondary",
    open: "bg-warning/30 text-warning-foreground",
    in_progress: "bg-warning/30 text-warning-foreground",
    under_review: "bg-warning/30 text-warning-foreground",
    submitted: "bg-warning/30 text-warning-foreground",
    rejected: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    closed: "bg-muted text-muted-foreground",
    inactive: "bg-muted text-muted-foreground",
    denied: "bg-destructive/10 text-destructive",
    failed: "bg-destructive/10 text-destructive",
    default: "bg-muted text-muted-foreground",
  };

  const normalizedStatus = normalizeStatusKey(status);
  const normalizedKey = normalizedStatus.replace(/\s+/g, "_");
  const tone = styles[normalizedKey] ?? styles[normalizedStatus] ?? styles.default;

  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}
      title={status || "Unknown"}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="annaseva-card flex flex-col items-center gap-1 p-8 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
  );
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function RoleShell({
  title,
  subtitle,
  items,
  active,
  onSelect,
  onSignOut,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  onSignOut: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto flex min-h-screen w-full flex-col pb-20 md:pb-0", wide ? "max-w-6xl" : "max-w-3xl")}>
      <header className="annaseva-gradient-header sticky top-0 z-10 px-4 py-4 text-primary-foreground shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="text-lg font-bold tracking-tight">
              AnnaSeva
            </Link>
            <p className="text-xs opacity-80">{subtitle}</p>
          </div>
          <button
            onClick={onSignOut}
            className="rounded-lg border border-primary-foreground/30 px-3 py-1.5 text-xs font-medium transition hover:bg-primary-foreground/10"
          >
            Sign out
          </button>
        </div>
        <h1 className="mt-3 text-xl font-bold">{title}</h1>
        {/* Desktop / tablet tab bar */}
        <nav aria-label="Main navigation" className="mt-3 hidden gap-1 overflow-x-auto md:flex">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={active === item.id}
              aria-current={active === item.id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
                active === item.id
                  ? "bg-primary-foreground text-primary"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-4 p-4">{children}</main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-border bg-card md:hidden">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active === item.id}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "flex min-w-16 shrink-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition",
              active === item.id ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
