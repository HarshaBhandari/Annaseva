import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  CircleAlert,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquareWarning,
  Package,
  Store,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { EmptyState, LoadingBlock, RoleShell, StatusChip } from "@/components/annaseva-ui";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — AnnaSeva" },
      { name: "description", content: "Monitor ration distribution, verification, complaints, and fair price shop operations." },
    ],
  }),
  beforeLoad: ({ context }) => {
    const user = (context as { user: { role: string } }).user;
    if (user.role !== "admin") {
      throw redirect({ to: user.role === "shopkeeper" ? "/shopkeeper" : "/beneficiary" });
    }
  },
  component: AdminPage,
});

type AdminTab = "dashboard" | "shops" | "stock" | "verification" | "refills" | "complaints";

function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("dashboard");

  const signOut = async () => {
    await apiPost("/auth/signout");
    navigate({ to: "/auth" });
  };

  return (
    <RoleShell
      title="District operations"
      subtitle="Administrator · Maharashtra PDS demo"
      active={tab}
      onSelect={(id) => setTab(id as AdminTab)}
      onSignOut={signOut}
      wide
      items={[
        { id: "dashboard", label: "Overview", icon: LayoutDashboard },
        { id: "shops", label: "Shops", icon: Store },
        { id: "stock", label: "Stock", icon: Package },
        { id: "verification", label: "Identity", icon: BadgeCheck },
        { id: "refills", label: "Refills", icon: Boxes },
        { id: "complaints", label: "Complaints", icon: MessageSquareWarning },
      ]}
    >
      {tab === "dashboard" && <DashboardTab />}
      {tab === "shops" && <ShopsTab />}
      {tab === "stock" && <StockTab />}
      {tab === "verification" && <VerificationTab />}
      {tab === "refills" && <RefillsTab />}
      {tab === "complaints" && <ComplaintsTab />}
    </RoleShell>
  );
}

function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => apiGet<any>("/admin/overview"),
    refetchInterval: 60_000,
  });
  if (isLoading) return <LoadingBlock label="Loading district operations…" />;
  const stats = [
    { label: "Total users", value: data?.users ?? 0, icon: Users, accent: "text-sky-300" },
    { label: "Beneficiaries", value: data?.beneficiaries ?? 0, icon: Users, accent: "text-cyan-300" },
    { label: "Shopkeepers", value: data?.shopkeepers ?? 0, icon: Store, accent: "text-emerald-300" },
    { label: "Fair price shops", value: data?.shops ?? 0, icon: Store, accent: "text-lime-300" },
    { label: "Monthly distributions", value: data?.monthly_deliveries ?? 0, icon: Package, accent: "text-emerald-300" },
    { label: "Today's bookings", value: data?.bookings_today ?? 0, icon: ClipboardCheck, accent: "text-amber-300" },
    { label: "Open complaints", value: data?.open_complaints ?? 0, icon: MessageSquareWarning, accent: "text-rose-300" },
    { label: "Low-stock items", value: data?.low_stock ?? 0, icon: CircleAlert, accent: "text-orange-300" },
    { label: "Identity reviews", value: data?.pending_verifications ?? 0, icon: BadgeCheck, accent: "text-cyan-300" },
  ];

  return (
    <div className="overflow-hidden rounded-xl bg-[#30343b] p-4 text-white shadow-lg sm:p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-white/55">District control room</p>
          <h2 className="mt-1 text-lg font-bold">Admin Dashboard</h2>
        </div>
        <div className="relative rounded-full bg-white/10 p-2.5" title="Open complaints and low-stock alerts">
          <Bell className="h-5 w-5" />
          {(Number(data?.open_complaints ?? 0) + Number(data?.low_stock ?? 0)) > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-400" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="flex min-h-24 items-center justify-between gap-2 rounded-lg bg-[#454a54] p-3 sm:p-4">
            <div className="min-w-0">
              <p className="text-xs text-white/65">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            </div>
            <Icon className={`h-6 w-6 shrink-0 ${accent}`} />
          </div>
        ))}
      </div>

      <section className="mt-5 rounded-lg bg-[#454a54] p-3 sm:p-4">
        <div className="mb-2 flex items-center gap-2">
          <ChartNoAxesCombined className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-bold">Monthly completed distributions</h3>
        </div>
        {data?.trend?.length ? (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#ffffff20" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#ffffff80" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke="#ffffff80" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#252930", border: "1px solid #ffffff22", borderRadius: 8, color: "white" }} />
                <Line type="monotone" dataKey="count" name="Completed distributions" stroke="#69d0c1" strokeWidth={3} dot={{ r: 3, fill: "#69d0c1" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-8 text-center text-sm text-white/55">Distribution history will appear here.</p>}
      </section>

      <section className="mt-4 rounded-lg bg-[#454a54] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">Ration distributed this month</h3>
            <p className="mt-1 text-xs text-white/60">Totals are grouped by unit and never combined.</p>
          </div>
          <Package className="h-5 w-5 shrink-0 text-emerald-300" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data?.monthly_quantity?.length ? data.monthly_quantity.map((row: any) => (
            <div key={row.unit} className="min-w-28 rounded-lg bg-[#30343b] px-3 py-2">
              <p className="text-xl font-bold tabular-nums">{Number(row.quantity).toLocaleString()}</p>
              <p className="text-xs text-white/65">{row.unit} distributed</p>
            </div>
          )) : <p className="text-sm text-white/60">No completed distributions this month.</p>}
        </div>
        <p className="mt-3 text-xs text-white/55">Ration is free. This system does not record monetary sales or revenue.</p>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">Recent alerts</h3>
          <span className="text-xs text-white/55">Live operational data</span>
        </div>
        {data?.alerts?.length ? (
          <div className="space-y-2">
            {data.alerts.map((alert: any) => (
              <div key={`${alert.type}-${alert.id}`} className={`flex gap-3 rounded-lg p-3 ${alert.type === "complaint" ? "bg-[#8b3d3a]" : "bg-[#7a542e]"}`}>
                {alert.type === "complaint" ? <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-bold">{alert.type === "complaint" ? `Complaint: ${alert.title}` : alert.title}</p>
                  <p className="mt-0.5 text-xs text-white/80">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="rounded-lg bg-white/5 p-4 text-sm text-white/60">No active alerts.</p>}
      </section>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
        <span className="rounded-full bg-white/10 px-3 py-1">{data?.pending_refills ?? 0} refill approvals</span>
        <span className="rounded-full bg-white/10 px-3 py-1">{data?.bookings ?? 0} total bookings</span>
      </div>
    </div>
  );
}

function ShopsTab() {
  const queryClient = useQueryClient();
  const { data: shops, isLoading } = useQuery({ queryKey: ["shops"], queryFn: () => apiGet<any[]>("/admin/shops") });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/admin/shops/${id}/status`, { status }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["shops"] }), queryClient.invalidateQueries({ queryKey: ["admin-overview"] })]),
  });
  if (isLoading) return <LoadingBlock />;
  return (
    <div className="space-y-3">
      {shops?.map((shop) => (
        <article key={shop.id} className="annaseva-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2"><Store className="h-4 w-4 text-primary" /><h3 className="font-bold text-foreground">{shop.shop_name}</h3><StatusChip status={shop.status} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{shop.shop_code} · {shop.address}, {shop.taluka}, {shop.district}</p>
            <p className="text-xs text-muted-foreground">Hours: {shop.operating_hours}</p>
          </div>
          <button
            onClick={() => toggle.mutate({ id: shop.id, status: shop.status === "active" ? "closed" : "active" })}
            disabled={toggle.isPending}
            className="rounded-lg border border-input px-3 py-2 text-xs font-bold text-foreground disabled:opacity-50"
          >
            {shop.status === "active" ? "Mark closed" : "Mark open"}
          </button>
        </article>
      ))}
    </div>
  );
}

function StockTab() {
  const { data: stock, isLoading } = useQuery({ queryKey: ["all-stock"], queryFn: () => apiGet<any[]>("/admin/stock") });
  if (isLoading) return <LoadingBlock />;
  const lowStock = stock?.filter((row) => Number(row.closing_stock) <= Number(row.minimum_threshold)) ?? [];
  return (
    <div className="space-y-3">
      {lowStock.length > 0 && <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive"><CircleAlert className="h-4 w-4" />{lowStock.length} stock lines need attention</div>}
      {stock?.map((row) => {
        const low = Number(row.closing_stock) <= Number(row.minimum_threshold);
        return (
          <article key={row.id} className="annaseva-card flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{row.ration_items?.item_name}</p><p className="text-xs text-muted-foreground">{row.fps_shops?.shop_name} · {row.fps_shops?.shop_code}</p></div>
            <div className="text-right"><p className={`text-sm font-bold ${low ? "text-destructive" : "text-secondary"}`}>{row.closing_stock} {row.ration_items?.unit}</p><p className="text-[11px] text-muted-foreground">Minimum {row.minimum_threshold}</p></div>
          </article>
        );
      })}
    </div>
  );
}

function VerificationTab() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data: reviews, isLoading } = useQuery({ queryKey: ["identity-reviews"], queryFn: () => apiGet<any[]>("/admin/verifications") });
  const review = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "verified" | "rejected" }) => apiPatch(`/admin/verifications/${userId}`, { status, note: notes[userId] }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["identity-reviews"] }), queryClient.invalidateQueries({ queryKey: ["admin-overview"] })]),
  });
  if (isLoading) return <LoadingBlock />;
  if (!reviews?.length) return <EmptyState title="No identity reviews waiting" hint="New mobile-verified submissions will appear here." />;
  return (
    <div className="space-y-3">
      {reviews.map((reviewRow) => (
        <article key={reviewRow.user_id} className="annaseva-card space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-bold text-foreground">{reviewRow.full_name}</h3><p className="text-xs text-muted-foreground">{reviewRow.email} · {reviewRow.mobile_number}</p></div>
            <StatusChip status={reviewRow.identity_status} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground"><span>Mobile OTP: <strong>{reviewRow.phone_verified_at ? "verified" : "not verified"}</strong></span><span>Aadhaar: <strong>{reviewRow.aadhaar_last4 ?? "not provided"}</strong></span></div>
          <input value={notes[reviewRow.user_id] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [reviewRow.user_id]: event.target.value }))} placeholder="Optional review note" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => review.mutate({ userId: reviewRow.user_id, status: "verified" })} disabled={review.isPending || !reviewRow.phone_verified_at} className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground disabled:opacity-50">Approve identity</button>
            <button onClick={() => review.mutate({ userId: reviewRow.user_id, status: "rejected" })} disabled={review.isPending} className="flex-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50">Reject</button>
          </div>
          <p className="text-xs text-muted-foreground">This is a manual demo review of the submitted last four digits, not an official Aadhaar verification.</p>
        </article>
      ))}
    </div>
  );
}

function RefillsTab() {
  const queryClient = useQueryClient();
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const { data: refills, isLoading } = useQuery({ queryKey: ["admin-refills"], queryFn: () => apiGet<any[]>("/admin/refills") });
  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) => apiPatch<{ status: string; stock_updated: boolean }>(`/admin/refills/${id}`, { status }),
    onSuccess: async (result) => {
      setDecisionMessage(result.status === "approved" && result.stock_updated
        ? "Refill approved. The shop's received and closing stock have been updated."
        : "Refill request rejected.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-refills"] }),
        queryClient.invalidateQueries({ queryKey: ["all-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
    },
    onError: (error: Error) => setDecisionMessage(error.message),
  });
  if (isLoading) return <LoadingBlock />;
  if (!refills?.length) return <div className="space-y-3">{decisionMessage && <p role="status" className="rounded-lg bg-secondary/10 p-3 text-sm text-secondary">{decisionMessage}</p>}<EmptyState title="No refill requests" hint="Shopkeepers' stock requests will appear here for approval." /></div>;
  return (
    <div className="space-y-3">
      {decisionMessage && <p role="status" className="rounded-lg bg-secondary/10 p-3 text-sm text-secondary">{decisionMessage}</p>}
      {refills.map((refill) => (
        <article key={refill.id} className="annaseva-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div><h3 className="font-bold text-foreground">{refill.item_name} · {refill.quantity} {refill.unit}</h3><p className="text-xs text-muted-foreground">{refill.shop_name} · requested by {refill.shopkeeper_name}</p></div>
          <div className="flex gap-2"><button onClick={() => decide.mutate({ id: refill.id, status: "approved" })} disabled={decide.isPending} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground">Approve</button><button onClick={() => decide.mutate({ id: refill.id, status: "rejected" })} disabled={decide.isPending} className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">Reject</button></div>
        </article>
      ))}
    </div>
  );
}

function ComplaintsTab() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data: complaints, isLoading } = useQuery({ queryKey: ["complaints"], queryFn: () => apiGet<any[]>("/admin/complaints") });
  const resolve = useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) => apiPatch(`/admin/complaints/${id}`, { resolutionNotes }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["complaints"] }), queryClient.invalidateQueries({ queryKey: ["admin-overview"] })]),
  });
  if (isLoading) return <LoadingBlock />;
  if (!complaints?.length) return <EmptyState title="No complaints" hint="Beneficiary complaints will appear here." />;
  return (
    <div className="space-y-3">
      {complaints.map((complaint) => (
        <article key={complaint.id} className="annaseva-card space-y-2 p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-foreground">{complaint.category}</h3><StatusChip status={complaint.status} /></div>
          <p className="text-xs text-muted-foreground">{complaint.fps_shops?.shop_name ?? "General"} · {complaint.beneficiary_profiles?.ration_cards?.masked_card_number}</p>
          <p className="text-sm text-foreground">{complaint.description}</p>
          {complaint.resolution_notes && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">Shop response: {complaint.resolution_notes}</p>}
          {complaint.status !== "resolved" && <div className="flex gap-2"><input value={notes[complaint.id] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [complaint.id]: event.target.value }))} placeholder="Admin resolution note" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs" /><button onClick={() => resolve.mutate({ id: complaint.id, resolutionNotes: notes[complaint.id] || "Resolved by district administrator." })} disabled={resolve.isPending} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground">Close</button></div>}
        </article>
      ))}
    </div>
  );
}