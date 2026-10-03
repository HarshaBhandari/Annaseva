import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, LayoutDashboard, MessageSquareWarning, Package, Wheat } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { EmptyState, LoadingBlock, RoleShell, StatCard, StatusChip } from "@/components/annaseva-ui";

export const Route = createFileRoute("/_authenticated/shopkeeper")({
  head: () => ({
    meta: [
      { title: "Shopkeeper Dashboard — AnnaSeva" },
      { name: "description", content: "Manage fair price shop stock, approve bookings, and record ration distributions." },
      { property: "og:title", content: "Shopkeeper Dashboard — AnnaSeva" },
      { property: "og:description", content: "AnnaSeva fair price shop management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopkeeperPage,
});

function ShopkeeperPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState("dashboard");

  const { data: shopkeeper, isLoading } = useQuery({
    queryKey: ["shopkeeper", user.id],
    queryFn: () => apiGet<any>("/shopkeeper/profile"),
  });

  const signOut = async () => {
    await apiPost("/auth/signout");
    navigate({ to: "/auth" });
  };

  if (isLoading) return <LoadingBlock label="Loading your shop…" />;
  if (!shopkeeper)
    return <ShopOnboarding userId={user.id} onDone={() => queryClient.invalidateQueries({ queryKey: ["shopkeeper", user.id] })} />;

  const fpsId = shopkeeper.fps_id ?? "";

  return (
    <RoleShell
      title={shopkeeper.fps_shops?.shop_name ?? "My Shop"}
      subtitle={`${shopkeeper.fps_shops?.shop_code ?? ""} · ${shopkeeper.fps_shops?.district ?? ""}`}
      active={tab}
      onSelect={setTab}
      onSignOut={signOut}
      items={[
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "bookings", label: "Bookings", icon: CalendarCheck },
        { id: "distribute", label: "Distribute", icon: Wheat },
        { id: "stock", label: "Stock", icon: Package },
        { id: "complaints", label: "Complaints", icon: MessageSquareWarning },
        { id: "alerts", label: "Alerts", icon: Bell },
      ]}
    >
      {tab === "dashboard" && <DashboardTab fpsId={fpsId} />}
      {tab === "bookings" && <BookingsTab fpsId={fpsId} />}
      {tab === "distribute" && <DistributeTab fpsId={fpsId} userId={user.id} />}
      {tab === "stock" && <StockTab fpsId={fpsId} />}
      {tab === "complaints" && <ComplaintsTab fpsId={fpsId} />}
      {tab === "alerts" && <AlertsTab userId={user.id} />}
    </RoleShell>
  );
}

function ShopOnboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [fpsId, setFpsId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: shops } = useQuery({
    queryKey: ["shops"],
    queryFn: () => apiGet<any[]>("/shops"),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fpsId) return setError("Choose your shop.");
    setBusy(true);
    try {
      await apiPost("/shopkeeper/setup", { fpsId });
      setBusy(false);
      onDone();
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : "Could not link shop.");
    }
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-10">
      <form onSubmit={submit} className="annaseva-card space-y-3 p-6">
        <h1 className="text-lg font-bold text-foreground">Link your fair price shop</h1>
        <select value={fpsId} onChange={(e) => setFpsId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
          <option value="">Choose a shop…</option>
          {shops?.map((s) => (
            <option key={s.id} value={s.id}>{s.shop_name} — {s.district}</option>
          ))}
        </select>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function DashboardTab({ fpsId }: { fpsId: string }) {
  const { data } = useQuery({
    queryKey: ["shop-dashboard", fpsId],
    queryFn: () => apiGet<any>("/shopkeeper/dashboard"),
  });
  const bookings = data?.bookings;
  const stock = data?.stock;
  const distributions = data?.distributions;

  const today = new Date().toISOString().slice(0, 10);
  const pending = bookings?.filter((b) => b.status === "pending").length ?? 0;
  const lowStock = stock?.filter((s) => s.closing_stock <= s.minimum_threshold).length ?? 0;
  const todayCount = distributions?.filter((d) => d.distribution_date === today).length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard icon={CalendarCheck} label="Pending bookings" value={pending} tone="accent" />
      <StatCard icon={Wheat} label="Distributions today" value={todayCount} tone="secondary" />
      <StatCard icon={Package} label="Low-stock items" value={lowStock} tone={lowStock ? "destructive" : "primary"} />
      <StatCard icon={LayoutDashboard} label="Total bookings" value={bookings?.length ?? 0} tone="primary" />
    </div>
  );
}

function BookingsTab({ fpsId }: { fpsId: string }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<Record<string, string>>({});
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["shop-bookings", fpsId],
    queryFn: () => apiGet<any[]>("/shopkeeper/bookings"),
  });

  const update = useMutation({
    mutationFn: async ({ id, status, rejection_reason }: { id: string; status: string; rejection_reason?: string }) => {
      await apiPatch(`/shopkeeper/bookings/${id}`, { status, rejectionReason: rejection_reason });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shop-bookings", fpsId] }),
  });

  if (isLoading) return <LoadingBlock />;
  if (!bookings?.length) return <EmptyState title="No bookings yet" hint="Beneficiary bookings for your shop will appear here." />;

  return (
    <div className="space-y-3">
      {bookings.map((b: any) => (
        <div key={b.id} className="annaseva-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">{b.booking_code}</p>
            <StatusChip status={b.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {b.beneficiary_profiles?.ration_cards?.masked_card_number} · {b.beneficiary_profiles?.ration_cards?.card_category} card ·
            Collect {b.collection_date} · {b.collection_slot}
          </p>
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {b.booking_items?.map((i: any) => (
              <div key={i.id} className="flex justify-between py-0.5">
                <span>{i.ration_items?.item_name}</span>
                <span className="font-semibold text-foreground">{i.requested_quantity} {i.ration_items?.unit}</span>
              </div>
            ))}
          </div>
          {b.status === "pending" && (
            <div className="mt-3 space-y-2">
              <input
                value={reason[b.id] ?? ""}
                onChange={(e) => setReason((r) => ({ ...r, [b.id]: e.target.value }))}
                placeholder="Rejection reason (only if rejecting)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => update.mutate({ id: b.id, status: "approved" })}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-bold text-secondary-foreground"
                >
                  Approve
                </button>
                <button
                  onClick={() => update.mutate({ id: b.id, status: "rejected", rejection_reason: reason[b.id] || "Not specified" })}
                  className="flex-1 rounded-lg bg-destructive/10 py-2 text-xs font-bold text-destructive"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DistributeTab({ fpsId, userId }: { fpsId: string; userId: string }) {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: approved, isLoading } = useQuery({
    queryKey: ["shop-bookings", fpsId],
    queryFn: () => apiGet<any[]>("/shopkeeper/bookings?status=approved"),
  });

  const distribute = useMutation({
    mutationFn: async (booking: any) => {
      await apiPost("/shopkeeper/distributions", { bookingId: booking.id });
    },
    onSuccess: () => {
      setConfirmId(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["shop-bookings", fpsId] });
      queryClient.invalidateQueries({ queryKey: ["shop-stock", fpsId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (!approved?.length) return <EmptyState title="No approved bookings" hint="Approve bookings first, then record distribution here." />;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {approved.map((b: any) => (
        <div key={b.id} className="annaseva-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">{b.booking_code}</p>
            <StatusChip status={b.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {b.beneficiary_profiles?.ration_cards?.masked_card_number} · {b.collection_date} · {b.collection_slot}
          </p>
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {b.booking_items?.map((i: any) => (
              <div key={i.id} className="flex justify-between py-0.5">
                <span>{i.ration_items?.item_name}</span>
                <span className="font-semibold text-foreground">{i.requested_quantity} {i.ration_items?.unit}</span>
              </div>
            ))}
          </div>
          {confirmId === b.id ? (
            <div className="mt-3 rounded-lg bg-warning/20 p-3">
              <p className="text-xs font-semibold text-warning-foreground">
                Confirm distribution? Stock will be reduced and a digital receipt generated. This cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => distribute.mutate(b)}
                  disabled={distribute.isPending}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-bold text-secondary-foreground disabled:opacity-50"
                >
                  {distribute.isPending ? "Recording…" : "Yes, distribute"}
                </button>
                <button onClick={() => setConfirmId(null)} className="flex-1 rounded-lg bg-muted py-2 text-xs font-bold text-muted-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmId(b.id)}
              className="mt-3 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
            >
              Record distribution
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function StockTab({ fpsId }: { fpsId: string }) {
  const queryClient = useQueryClient();
  const [received, setReceived] = useState<Record<string, string>>({});
  const { data: stock, isLoading } = useQuery({
    queryKey: ["shop-stock", fpsId],
    queryFn: () => apiGet<any[]>("/shopkeeper/stock"),
  });
  const { data: refills } = useQuery({
    queryKey: ["shop-refills", fpsId],
    queryFn: () => apiGet<any[]>("/shopkeeper/refills"),
  });

  const addStock = useMutation({
    mutationFn: async ({ row, qty }: { row: any; qty: number }) => {
      await apiPost(`/shopkeeper/stock/${row.id}/receive`, { quantity: qty });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shop-stock", fpsId] }),
  });

  if (isLoading) return <LoadingBlock />;

  return (
    <div className="space-y-3">
      {stock?.map((s: any) => {
        const low = s.closing_stock <= s.minimum_threshold;
        return (
          <div key={s.id} className="annaseva-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{s.ration_items?.item_name}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${low ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary"}`}>
                {s.closing_stock} {s.ration_items?.unit} {low ? "· Low" : ""}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] text-muted-foreground">
              <div><p className="font-bold text-foreground">{s.opening_stock}</p>Opening</div>
              <div><p className="font-bold text-foreground">{s.received_stock}</p>Received</div>
              <div><p className="font-bold text-foreground">{s.distributed_stock}</p>Distributed</div>
              <div><p className="font-bold text-foreground">{s.minimum_threshold}</p>Min. level</div>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                min={1}
                value={received[s.id] ?? ""}
                onChange={(e) => setReceived((r) => ({ ...r, [s.id]: e.target.value }))}
                placeholder={`Qty needed (${s.ration_items?.unit})`}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs"
              />
              <button
                onClick={() => {
                  const qty = Number(received[s.id]);
                  if (qty > 0) addStock.mutate({ row: s, qty });
                }}
                disabled={addStock.isPending}
                className="rounded-lg bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground disabled:opacity-50"
              >
                Request refill
              </button>
            </div>
          </div>
        );
      })}
      <section className="space-y-2 pt-2">
        <h2 className="text-sm font-bold text-foreground">Refill requests</h2>
        {refills?.length ? refills.map((refill: any) => (
          <div key={refill.id} className="annaseva-card flex items-center justify-between gap-3 p-3 text-sm">
            <span>{refill.item_name} · {refill.quantity} {refill.unit}</span>
            <StatusChip status={refill.status} />
          </div>
        )) : <p className="text-sm text-muted-foreground">No refill requests yet.</p>}
      </section>
    </div>
  );
}

function ComplaintsTab({ fpsId }: { fpsId: string }) {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data: complaints, isLoading } = useQuery({
    queryKey: ["shop-complaints", fpsId],
    queryFn: () => apiGet<any[]>("/shopkeeper/complaints"),
  });
  const reply = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "in_progress" | "resolved" }) => {
      await apiPatch(`/shopkeeper/complaints/${id}`, {
        status,
        reply: replies[id]?.trim() || (status === "resolved" ? "Resolved by the fair price shop." : "We are reviewing this complaint."),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shop-complaints", fpsId] }),
  });
  if (isLoading) return <LoadingBlock />;
  if (!complaints?.length) return <EmptyState title="No complaints for this shop" hint="Beneficiary complaints assigned to your shop will appear here." />;

  return (
    <div className="space-y-3">
      {complaints.map((complaint: any) => (
        <article key={complaint.id} className="annaseva-card space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-foreground">{complaint.category}</p>
            <StatusChip status={complaint.status} />
          </div>
          <p className="text-xs text-muted-foreground">{complaint.beneficiary_name} · {complaint.masked_card_number ?? "Card not linked"}</p>
          <p className="text-sm text-foreground">{complaint.description}</p>
          {complaint.resolution_notes && <p className="rounded-lg bg-muted p-2 text-sm text-muted-foreground">Previous response: {complaint.resolution_notes}</p>}
          {complaint.status !== "resolved" && (
            <>
              <textarea
                value={replies[complaint.id] ?? ""}
                onChange={(event) => setReplies((value) => ({ ...value, [complaint.id]: event.target.value }))}
                rows={2}
                placeholder="Reply to the beneficiary"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => reply.mutate({ id: complaint.id, status: "in_progress" })} disabled={reply.isPending} className="flex-1 rounded-lg border border-input px-3 py-2 text-xs font-bold text-foreground disabled:opacity-50">In progress</button>
                <button onClick={() => reply.mutate({ id: complaint.id, status: "resolved" })} disabled={reply.isPending} className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground disabled:opacity-50">Resolve</button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function AlertsTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => apiGet<any[]>("/notifications"),
  });
  if (isLoading) return <LoadingBlock />;
  if (!alerts?.length) return <EmptyState title="No alerts" hint="Bookings, complaints, and stock approvals will appear here." />;
  return (
    <div className="space-y-2">
      {alerts.map((alert: any) => (
        <button
          key={alert.id}
          onClick={async () => {
            if (!alert.read_status) {
              await apiPatch(`/notifications/${alert.id}/read`, {});
              await queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
            }
          }}
          className={`annaseva-card w-full p-3 text-left ${alert.read_status ? "opacity-60" : ""}`}
        >
          <div className="flex items-center justify-between gap-3"><span className="font-semibold text-foreground">{alert.title}</span><StatusChip status={alert.notification_type} /></div>
          <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
        </button>
      ))}
    </div>
  );
}
