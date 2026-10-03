import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Bell, CalendarCheck, Home, User, Wheat } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { CARD_CATEGORIES, SLOTS } from "@/lib/annaseva";
import { EmptyState, LoadingBlock, RoleShell, StatCard, StatusChip } from "@/components/annaseva-ui";

export const Route = createFileRoute("/_authenticated/beneficiary")({
  head: () => ({
    meta: [
      { title: "My Ration — AnnaSeva" },
      { name: "description", content: "View your ration entitlement, fair price shop stock, book collection slots, and track bookings." },
      { property: "og:title", content: "My Ration — AnnaSeva" },
      { property: "og:description", content: "Your AnnaSeva beneficiary dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BeneficiaryPage,
});

const ENTITLEMENT_DETAILS: Record<string, { marathi: string; image: string }> = {
  Rice: {
    marathi: "तांदूळ",
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=240&q=80",
  },
  Wheat: {
    marathi: "गहू",
    image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=240&q=80",
  },
  Sugar: {
    marathi: "साखर",
    image: "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=240&q=80",
  },
  "Tur Dal": {
    marathi: "तूर डाळ",
    image: "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=240&q=80",
  },
  "Cooking Oil": {
    marathi: "खाद्यतेल",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=240&q=80",
  },
  Kerosene: { marathi: "रॉकेल", image: "" },
};

function BeneficiaryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState("home");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["beneficiary-profile", user.id],
    queryFn: () => apiGet<any>("/beneficiary/profile"),
  });

  const signOut = async () => {
    await apiPost("/auth/signout");
    navigate({ to: "/auth" });
  };

  if (isLoading) return <LoadingBlock label="Loading your profile…" />;
  if (!profile) return <Onboarding userId={user.id} onDone={() => queryClient.invalidateQueries({ queryKey: ["beneficiary-profile", user.id] })} />;

  return (
    <RoleShell
      title={`Namaste, ${profile.ration_cards?.card_category ?? ""} card holder`}
      subtitle={`${profile.fps_shops?.shop_name ?? "No shop assigned"} · Family of ${profile.family_size}`}
      active={tab}
      onSelect={setTab}
      onSignOut={signOut}
      items={[
        { id: "home", label: "Home", icon: Home },
        { id: "book", label: "Book", icon: CalendarCheck },
        { id: "bookings", label: "Bookings", icon: Wheat },
        { id: "alerts", label: "Alerts", icon: Bell },
        { id: "profile", label: "Profile", icon: User },
      ]}
    >
      {tab === "home" && <HomeTab profile={profile} />}
      {tab === "book" && <BookTab profile={profile} onBooked={() => setTab("bookings")} />}
      {tab === "bookings" && <BookingsTab profile={profile} />}
      {tab === "alerts" && <AlertsTab userId={user.id} />}
      {tab === "profile" && <ProfileTab profile={profile} />}
    </RoleShell>
  );
}

function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [familySize, setFamilySize] = useState(4);
  const [category, setCategory] = useState<string>("Yellow");
  const [fpsId, setFpsId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: shops } = useQuery({
    queryKey: ["shops"],
    queryFn: () => apiGet<any[]>("/shops"),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fpsId) return setError("Please choose your fair price shop.");
    setBusy(true);
    setError(null);
    try {
      await apiPost("/beneficiary/setup", { familySize, category, fpsId });
      setBusy(false);
      onDone();
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : "Could not create ration profile.");
    }
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-10">
      <div className="annaseva-card p-6">
        <h1 className="text-lg font-bold text-foreground">Set up your ration profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time setup. Demo data only — never enter a real full Aadhaar number.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Ration card category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
              {CARD_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c} card</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Fair price shop</span>
            <select value={fpsId} onChange={(e) => setFpsId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
              <option value="">Choose a shop…</option>
              {shops?.map((s) => (
                <option key={s.id} value={s.id}>{s.shop_name} — {s.district}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Family size</span>
            <input type="number" min={1} max={20} value={familySize} onChange={(e) => setFamilySize(Number(e.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

function VerificationTab({ userId, onVerified }: { userId: string; onVerified: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data: verification, isLoading } = useQuery({
    queryKey: ["user-verification", userId],
    queryFn: () => apiGet<any>("/beneficiary/verification"),
  });
  const sendCode = useMutation({
    mutationFn: () => apiPost<{ demo_code?: string; masked_mobile: string }>("/beneficiary/verification/otp/send"),
    onSuccess: (result) => {
      setDemoCode(result.demo_code ?? null);
      setMessage(`Code requested for ${result.masked_mobile}.`);
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const verifyCode = useMutation({
    mutationFn: () => apiPost("/beneficiary/verification/otp/verify", { code }),
    onSuccess: async () => {
      setMessage("Mobile number verified.");
      setDemoCode(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["user-verification", userId] });
      onVerified();
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const submitIdentity = useMutation({
    mutationFn: () => apiPost("/beneficiary/verification/submit", { aadhaarLast4 }),
    onSuccess: async () => {
      setMessage("Identity details submitted for manual review.");
      setAadhaarLast4("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-verification", userId] }),
        queryClient.invalidateQueries({ queryKey: ["beneficiary-profile", userId] }),
      ]);
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (isLoading) return <LoadingBlock />;
  const phoneVerified = Boolean(verification?.phone_verified_at);
  const identityStatus = verification?.identity_status ?? "not_submitted";

  return (
    <div className="space-y-3">
      <section className="annaseva-card space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-foreground">Mobile verification</h2>
            <p className="text-sm text-muted-foreground">Verify the number saved on your account.</p>
          </div>
          <StatusChip status={phoneVerified ? "verified" : "pending"} />
        </div>
        {!phoneVerified && (
          <>
            <button
              onClick={() => sendCode.mutate()}
              disabled={sendCode.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {sendCode.isPending ? "Requesting…" : "Request OTP"}
            </button>
            {demoCode && <p className="rounded-lg bg-warning/20 p-3 text-sm text-warning-foreground">Development demo code: <strong>{demoCode}</strong></p>}
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP"
                className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => verifyCode.mutate()}
                disabled={code.length !== 6 || verifyCode.isPending}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground disabled:opacity-50"
              >
                Verify
              </button>
            </div>
          </>
        )}
      </section>

      <section className="annaseva-card space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-foreground">Optional identity review</h2>
            <p className="text-sm text-muted-foreground">Mobile OTP verification lets you continue booking. You can submit Aadhaar last four digits for manual admin review.</p>
          </div>
          <StatusChip status={identityStatus} />
        </div>
        {identityStatus !== "verified" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Aadhaar last four digits only</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={aadhaarLast4}
                onChange={(event) => setAadhaarLast4(event.target.value.replace(/\D/g, ""))}
                placeholder="0000"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
              />
            </label>
            {verification?.review_note && <p className="rounded-lg bg-muted p-3 text-sm text-foreground">Review note: {verification.review_note}</p>}
            <button
              onClick={() => submitIdentity.mutate()}
              disabled={!phoneVerified || aadhaarLast4.length !== 4 || submitIdentity.isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {submitIdentity.isPending ? "Submitting…" : "Submit for review"}
            </button>
          </>
        )}
        <p className="text-xs text-muted-foreground">Demo only: OTP is simulated in development. No full Aadhaar number, face image, fingerprint, or biometric template is collected. Real OTP/Aadhaar checks need approved providers and hardware.</p>
        {message && <p className="rounded-lg bg-muted p-3 text-sm text-foreground">{message}</p>}
      </section>
    </div>
  );
}

function HomeTab({ profile }: { profile: any }) {
  const { data: entitlements } = useQuery({
    queryKey: ["entitlements", profile.ration_cards?.card_category],
    queryFn: () => apiGet<any[]>(`/beneficiary/entitlements?category=${encodeURIComponent(profile.ration_cards.card_category)}`),
  });
  const { data: stock } = useQuery({
    queryKey: ["stock", profile.fps_id],
    queryFn: () => apiGet<any[]>("/beneficiary/stock"),
  });

  return (
    <>
      <section className={`overflow-hidden rounded-xl p-5 shadow-sm ${profile.ration_cards?.card_category === "Yellow" ? "bg-amber-300 text-amber-950" : profile.ration_cards?.card_category === "Orange" ? "bg-orange-300 text-orange-950" : "border border-border bg-white text-slate-900"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase">AnnaSeva · Ration card</p>
            <h2 className="mt-1 text-xl font-bold">{profile.ration_cards?.card_category} card</h2>
            <p className="mt-1 text-sm">कुटुंब सदस्य · Family of {profile.family_size}</p>
          </div>
          <StatusChip status={profile.ration_cards?.verification_status ?? "pending"} />
        </div>
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-current/20 pt-3">
          <div><p className="text-xs opacity-75">Card number · कार्ड क्रमांक</p><p className="text-lg font-bold tracking-wider">{profile.ration_cards?.masked_card_number}</p></div>
          <p className="max-w-36 text-right text-xs font-semibold">{profile.fps_shops?.shop_name}</p>
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Your monthly entitlement ({profile.ration_cards?.card_category} card · {profile.family_size} members)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {entitlements?.map((r: any) => (
            <div key={r.id} className="annaseva-card flex min-h-28 items-center gap-4 p-3 sm:p-4">
              {ENTITLEMENT_DETAILS[r.ration_items?.item_name]?.image ? (
                <img
                  src={ENTITLEMENT_DETAILS[r.ration_items.item_name].image}
                  alt={r.ration_items.item_name}
                  loading="lazy"
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-3xl">🌾</div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">{r.ration_items?.item_name}</p>
                <p lang="mr" className="text-base font-semibold text-muted-foreground">{ENTITLEMENT_DETAILS[r.ration_items?.item_name]?.marathi}</p>
                <p className="mt-1 text-xl font-bold text-secondary">
                  {(r.quantity_per_person * profile.family_size).toFixed(1)} {r.ration_items?.unit}
                </p>
                <p className="text-xs text-muted-foreground">{r.scheme_name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Stock at {profile.fps_shops?.shop_name}
        </h2>
        <div className="space-y-2">
          {stock?.map((s: any) => {
            const low = s.closing_stock <= s.minimum_threshold;
            return (
              <div key={s.id} className="annaseva-card flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.ration_items?.item_name}</p>
                  <p className="text-xs text-muted-foreground">{s.fps_shops?.operating_hours}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${low ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary"}`}>
                  {low ? "Low" : "Available"} · {s.closing_stock} {s.ration_items?.unit}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function BookTab({ profile, onBooked }: { profile: any; onBooked: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>(SLOTS[0]);
  const [error, setError] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);

  const { data: verification } = useQuery({
    queryKey: ["user-verification", profile.user_id],
    queryFn: () => apiGet<any>("/beneficiary/verification"),
    refetchInterval: 15_000,
  });

  const { data: entitlements } = useQuery({
    queryKey: ["entitlements", profile.ration_cards?.card_category],
    queryFn: () => apiGet<any[]>(`/beneficiary/entitlements?category=${encodeURIComponent(profile.ration_cards.card_category)}`),
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Pick a collection date.");
      await apiPost("/beneficiary/bookings", { collectionDate: date, slot });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      onBooked();
    },
    onError: (e: Error) => setError(e.message),
  });

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const canBook = Boolean(verification?.phone_verified_at);

  return (
    <div className="annaseva-card p-5">
      <h2 className="font-bold text-foreground">Book a collection slot</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your full monthly entitlement will be booked. Ration is free — no payment is ever involved.
      </p>
      {!canBook && <p className="mt-3 rounded-lg bg-warning/20 p-3 text-base text-warning-foreground">Verify your mobile number to continue. OTP verification takes about a minute.</p>}
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Collection date</span>
          <input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" />
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium text-foreground">Time slot</span>
          <div className="grid grid-cols-2 gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${slot === s ? "border-primary bg-primary/5 text-primary" : "border-input text-muted-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {(entitlements ?? []).filter((r: any) => r.quantity_per_person > 0).map((r: any) => (
            <div key={r.id} className="flex justify-between py-0.5">
              <span>{r.ration_items?.item_name}</span>
              <span className="font-semibold text-foreground">{(r.quantity_per_person * profile.family_size).toFixed(1)} {r.ration_items?.unit}</span>
            </div>
          ))}
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!canBook ? (
          <button
            onClick={() => setShowVerification((visible) => !visible)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/5 py-3 text-base font-bold text-primary"
          >
            <BadgeCheck className="h-5 w-5" />
            {showVerification ? "Hide verification" : "Verify mobile to book"}
          </button>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-secondary/10 p-3 text-base font-semibold text-secondary">
            <BadgeCheck className="h-5 w-5" /> Mobile verified · मोबाईल पडताळला
          </p>
        )}
        {showVerification && !canBook && (
          <VerificationTab
            userId={profile.user_id}
            onVerified={() => {
              setShowVerification(false);
              setError(null);
            }}
          />
        )}
        <button
          onClick={() => book.mutate()}
          disabled={book.isPending || !canBook}
          className="w-full rounded-lg bg-secondary py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-50"
        >
          {book.isPending ? "Booking…" : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}

function BookingsTab({ profile }: { profile: any }) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings", profile.id],
    queryFn: () => apiGet<any[]>("/beneficiary/bookings"),
  });

  if (isLoading) return <LoadingBlock />;
  if (!bookings?.length) return <EmptyState title="No bookings yet" hint="Book a collection slot from the Book tab." />;

  return (
    <div className="space-y-3">
      {bookings.map((b: any) => (
        <div key={b.id} className="annaseva-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">{b.booking_code}</p>
            <StatusChip status={b.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Collect on {b.collection_date} · {b.collection_slot}
          </p>
          {b.rejection_reason && <p className="mt-1 text-xs text-destructive">Reason: {b.rejection_reason}</p>}
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {b.booking_items?.map((i: any) => (
              <div key={i.id} className="flex justify-between py-0.5">
                <span>{i.ration_items?.item_name}</span>
                <span className="font-semibold text-foreground">{i.requested_quantity} {i.ration_items?.unit}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertsTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => apiGet<any[]>("/beneficiary/notifications"),
  });

  const markRead = async (id: string) => {
    await apiPatch(`/beneficiary/notifications/${id}/read`, {});
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  };

  if (isLoading) return <LoadingBlock />;
  if (!notifications?.length) return <EmptyState title="No notifications" hint="Booking and distribution updates will appear here." />;

  return (
    <div className="space-y-2">
      {notifications.map((n: any) => (
        <button
          key={n.id}
          onClick={() => !n.read_status && markRead(n.id)}
          className={`annaseva-card w-full p-3 text-left ${n.read_status ? "opacity-60" : ""}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{n.title}</p>
            {!n.read_status && <span className="h-2 w-2 rounded-full bg-accent" />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
        </button>
      ))}
    </div>
  );
}

function ProfileTab({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("Stock not available");
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);

  const complain = useMutation({
    mutationFn: async () => {
      await apiPost("/beneficiary/complaints", {
        category,
        description,
      });
    },
    onSuccess: () => {
      setSent(true);
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
  });

  return (
    <>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">Ration card</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Card number</dt><dd className="font-semibold text-foreground">{profile.ration_cards?.masked_card_number}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Category</dt><dd className="font-semibold text-foreground">{profile.ration_cards?.card_category}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Verification</dt><dd><StatusChip status={profile.ration_cards?.verification_status ?? "pending"} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Fair price shop</dt><dd className="font-semibold text-foreground">{profile.fps_shops?.shop_name}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Shop hours</dt><dd className="font-semibold text-foreground">{profile.fps_shops?.operating_hours}</dd></div>
        </dl>
      </div>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">File a complaint</h2>
        <div className="mt-3 space-y-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
            {["Stock not available", "Quality issue", "Quantity short", "Behaviour issue", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue…"
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          {sent && <p className="rounded-lg bg-secondary/10 px-3 py-2 text-sm text-secondary">Complaint submitted. The admin team will review it.</p>}
          <button
            onClick={() => complain.mutate()}
            disabled={complain.isPending || description.trim().length < 5}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {complain.isPending ? "Submitting…" : "Submit complaint"}
          </button>
        </div>
      </div>
    </>
  );
}
