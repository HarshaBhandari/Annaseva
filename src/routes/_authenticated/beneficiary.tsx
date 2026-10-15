import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Home,
  MapPin,
  Package,
  Pencil,
  Phone,
  Trash2,
  User,
  Users,
  Wheat,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { CARD_CATEGORIES, SLOTS } from "@/lib/annaseva";
import {
  EmptyState,
  LoadingBlock,
  RoleShell,
  StatCard,
  StatusChip,
} from "@/components/annaseva-ui";

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

  const { data: profile, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["beneficiary-profile", user.id],
    queryFn: () => apiGet<any>("/beneficiary/profile"),
  });

  const signOut = async () => {
    await apiPost("/auth/signout");
    navigate({ to: "/auth" });
  };

  if (isLoading) return <LoadingBlock label="Loading your profile…" />;
  if (isError) {
    return (
      <div className="mx-auto max-w-md p-4 pt-10">
        <div className="annaseva-card space-y-3 p-6">
          <h1 className="text-lg font-bold text-foreground">Could not load your beneficiary profile</h1>
          <p className="text-sm text-muted-foreground">
            Your profile was not changed. Try again; if the problem continues, share the error below
            with your administrator.
          </p>
          {error instanceof Error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }
  if (!profile) return <Onboarding userId={user.id} onDone={() => queryClient.invalidateQueries({ queryKey: ["beneficiary-profile", user.id] })} />;

  return (
    <RoleShell
      title={`Namaste, ${profile.ration_cards?.card_category ?? ""} card holder`}
      subtitle={`${profile.fps_shops ? `${profile.fps_shops.shop_code} · ${profile.fps_shops.shop_name}` : "No shop assigned"} · Family of ${profile.family_size}`}
      active={tab}
      onSelect={setTab}
      onSignOut={signOut}
      items={[
        { id: "home", label: "Home", icon: Home },
        { id: "stock", label: "Stock", icon: Package },
        { id: "book", label: "Book", icon: CalendarCheck },
        { id: "bookings", label: "Bookings", icon: Wheat },
        { id: "alerts", label: "Alerts", icon: Bell },
        { id: "scheme", label: "Scheme", icon: CreditCard },
        { id: "profile", label: "Profile", icon: User },
      ]}
    >
      {tab === "home" && <HomeTab profile={profile} />}
      {tab === "stock" && <StockTab profile={profile} />}
      {tab === "book" && <BookTab profile={profile} onBooked={() => setTab("bookings")} />}
      {tab === "bookings" && <BookingsTab profile={profile} />}
      {tab === "alerts" && <AlertsTab userId={user.id} />}
      {tab === "scheme" && <SchemeTab profile={profile} />}
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

function VerificationTab({ userId }: { userId: string }) {
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
  const phoneVerifiedThisMonth = Boolean(Number(verification?.phone_verified_this_month));
  const identityStatus = verification?.identity_status ?? "not_submitted";

  return (
    <div className="space-y-3">
      <section className="annaseva-card space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-foreground">Mobile verification</h2>
            <p className="text-sm text-muted-foreground">Verify the number saved on your account once every month before booking.</p>
          </div>
          <StatusChip status={phoneVerifiedThisMonth ? "verified" : "pending"} />
        </div>
        {!phoneVerifiedThisMonth && (
          <>
            <button
              onClick={() => sendCode.mutate()}
              disabled={sendCode.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {sendCode.isPending ? "Requesting…" : verification?.phone_verified_at ? "Request monthly OTP" : "Request OTP"}
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
            <h2 className="font-bold text-foreground">Admin identity review</h2>
            <p className="text-sm text-muted-foreground">Submit only your Aadhaar last four digits. An administrator must approve them before you can book.</p>
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
              disabled={!phoneVerifiedThisMonth || aadhaarLast4.length !== 4 || submitIdentity.isPending}
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
    queryFn: () =>
      apiGet<any[]>(
        `/beneficiary/entitlements?category=${encodeURIComponent(
          profile.ration_cards?.card_category ?? ""
        )}`
      ),
  });

  return (
    <>
      <section
        className={`overflow-hidden rounded-xl p-5 shadow-sm ${
          profile.ration_cards?.card_category === "Yellow"
            ? "bg-amber-300 text-amber-950"
            : profile.ration_cards?.card_category === "Orange"
              ? "bg-orange-300 text-orange-950"
              : "border border-border bg-white text-slate-900"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase">
              AnnaSeva · Ration card
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {profile.ration_cards?.card_category} card
            </h2>
            <p className="mt-1 text-sm">
              कुटुंब सदस्य · Family of {profile.family_size}
            </p>
          </div>

          <StatusChip
            status={
              profile.ration_cards?.verification_status ?? "pending"
            }
          />
        </div>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-current/20 pt-3">
          <div>
            <p className="text-xs opacity-75">
              Card number · कार्ड क्रमांक
            </p>
            <p className="text-lg font-bold tracking-wider">
              {profile.ration_cards?.masked_card_number}
            </p>
          </div>

          <p className="max-w-36 text-right text-xs font-semibold">
            {profile.fps_shops?.shop_name}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Your monthly entitlement (
          {profile.ration_cards?.card_category} card ·{" "}
          {profile.family_size} members)
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(entitlements ?? []).map((r: any) => {
            const itemName: string | undefined =
              r.ration_items?.item_name;

            const details = itemName
              ? ENTITLEMENT_DETAILS[itemName]
              : undefined;

            return (
              <div
                key={r.id}
                className="annaseva-card flex min-h-28 items-center gap-4 p-3 sm:p-4"
              >
                {details?.image ? (
                  <img
                    src={details.image}
                    alt={itemName ?? "Ration item"}
                    loading="lazy"
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-3xl"
                  >
                    🌾
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-lg font-bold text-foreground">
                    {itemName ?? "Ration item"}
                  </p>

                  <p
                    lang="mr"
                    className="text-base font-semibold text-muted-foreground"
                  >
                    {details?.marathi ?? ""}
                  </p>

                  <p className="mt-1 text-xl font-bold text-secondary">
                    {(
                      Number(r.quantity_per_person ?? 0) *
                      Number(profile.family_size ?? 0)
                    ).toFixed(1)}{" "}
                    {r.ration_items?.unit}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {r.scheme_name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}


function StockTab({ profile }: { profile: any }) {
  const { data: stock, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["stock", profile.fps_id],
    queryFn: () => apiGet<any[]>("/beneficiary/stock"),
  });
  if (isLoading) return <LoadingBlock label="Checking shop availability…" />;

  const items = stock ?? [];
  const lowCount = items.filter((item: any) => Number(item.closing_stock) <= Number(item.minimum_threshold)).length;
  const assignedShop = profile.fps_shops ?? items[0]?.fps_shops;

  return (
    <div className="space-y-4">
      <section className="annaseva-gradient-header overflow-hidden rounded-xl p-5 text-primary-foreground shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase opacity-75">Fair price shop</p>
            <h2 className="mt-1 text-xl font-bold">Stock availability</h2>
            <p className="mt-1 text-sm opacity-80">{assignedShop?.shop_name ?? "No shop assigned"}</p>
          </div>
          <Package className="h-8 w-8 shrink-0 opacity-85" />
        </div>
        {assignedShop && (
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-primary-foreground/20 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs opacity-75">FPS shop ID</dt>
              <dd className="mt-0.5 font-semibold">{assignedShop.fps_id ?? assignedShop.shop_code}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-75">Shopkeeper</dt>
              <dd className="mt-0.5 font-semibold">{assignedShop.shopkeeper_name ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-75">Shop address</dt>
              <dd className="mt-0.5 font-semibold">
                {[assignedShop.address, assignedShop.taluka, assignedShop.district].filter(Boolean).join(", ") || "Not on file"}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-75">Shopkeeper mobile</dt>
              <dd className="mt-0.5 font-semibold">{assignedShop.shopkeeper_mobile_number ?? "Not on file"}</dd>
            </div>
          </dl>
        )}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-primary-foreground/20 pt-4">
          <div><p className="text-xs opacity-75">Items listed</p><p className="mt-1 text-2xl font-bold tabular-nums">{items.length}</p></div>
          <div><p className="text-xs opacity-75">Below reserve level</p><p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">{lowCount}<CircleAlert className="h-5 w-5" /></p></div>
        </div>
      </section>

      {isError && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <p>Could not load stock availability: {error.message}</p>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-2 font-bold underline disabled:opacity-50">
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}

      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item: any) => {
            const low = Number(item.closing_stock) <= Number(item.minimum_threshold);
            return (
              <article key={item.id} className="annaseva-card relative overflow-hidden p-4">
                <div className={`absolute inset-y-0 left-0 w-1 ${low ? "bg-warning" : "bg-secondary"}`} />
                <div className="flex items-start justify-between gap-3 pl-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Ration item</p>
                    <h3 className="mt-1 truncate text-base font-bold text-foreground">{item.ration_items?.item_name}</h3>
                    <p className="mt-2 text-xs text-muted-foreground">Reserve level: {item.minimum_threshold} {item.ration_items?.unit}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{item.closing_stock}</p>
                    <p className="text-xs text-muted-foreground">{item.ration_items?.unit} available</p>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${low ? "bg-warning/20 text-warning-foreground" : "bg-secondary/10 text-secondary"}`}>
                      {low ? "Low stock" : "Available"}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : !isError ? (
        <EmptyState title="Stock information unavailable" hint="Your assigned shop has not published stock details yet." />
      ) : null}
      <p className="text-xs text-muted-foreground">Availability can change during the day. Confirm with your fair price shop before traveling.</p>
    </div>
  );
}

function BookTab({ profile, onBooked }: { profile: any; onBooked: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>(SLOTS[0]);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      onBooked();
    },
    onError: (e: Error) => setError(e.message),
  });

  const today = new Date();
  const minDate = formatDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const maxDate = formatDateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const canBook = Boolean(Number(verification?.phone_verified_this_month) && verification?.identity_status === "verified");
  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["my-bookings", profile.id],
    queryFn: () => apiGet<any[]>("/beneficiary/bookings"),
  });
  const currentMonth = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)).slice(0, 7);
  const currentMonthBooking = bookings?.find((booking: any) =>
    String(booking.collection_date).slice(0, 7) === currentMonth &&
    !["rejected", "cancelled"].includes(booking.status),
  );

  return (
    <div className="annaseva-card p-5">
      <h2 className="font-bold text-foreground">Book a collection slot</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your full monthly entitlement will be booked. Ration is free — no payment is ever involved.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Choose a collection date this month only. Next month’s ration can only be booked next month. Verify by OTP every month before booking.</p>
      {currentMonthBooking && (
        <p role="status" className="mt-3 rounded-lg bg-warning/20 p-3 text-sm font-medium text-warning-foreground">
          Your family has already booked ration for this month ({currentMonthBooking.booking_code}). You cannot book it again.
        </p>
      )}
      {!canBook && <p className="mt-3 rounded-lg bg-warning/20 p-3 text-sm text-warning-foreground">{!Number(verification?.phone_verified_this_month) ? "Verify your mobile number by OTP this month before booking. Identity approval remains required." : verification?.identity_status === "pending" ? "Your last-four digits are waiting for admin review. Booking will unlock after approval." : verification?.identity_status === "rejected" ? "Your identity review needs attention. Update your last-four digits and resubmit for admin approval." : "Submit your Aadhaar last four digits for admin review to continue booking."}</p>}
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Collection date</span>
          <input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" />
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
        <VerificationTab userId={profile.user_id} />
        {canBook && (
          <p className="flex items-center gap-2 rounded-lg bg-secondary/10 p-3 text-base font-semibold text-secondary">
            <BadgeCheck className="h-5 w-5" /> Mobile and identity approved · पडताळणी पूर्ण
          </p>
        )}
        <button
          onClick={() => book.mutate()}
          disabled={book.isPending || bookingsLoading || !canBook || Boolean(currentMonthBooking)}
          className="w-full rounded-lg bg-secondary py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-50"
        >
          {book.isPending ? "Booking…" : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function BookingsTab({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [dateMessage, setDateMessage] = useState<{ bookingId: string; text: string; isError: boolean } | null>(null);
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings", profile.id],
    queryFn: () => apiGet<any[]>("/beneficiary/bookings"),
  });
  const updateDate = useMutation({
    mutationFn: ({ id, collectionDate }: { id: string; collectionDate: string }) =>
      apiPatch(`/beneficiary/bookings/${id}/date`, { collectionDate }),
    onSuccess: async (_result, variables) => {
      setEditingId(null);
      setDateMessage({
        bookingId: variables.id,
        text: "Date updated and sent to the shopkeeper for approval.",
        isError: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings", profile.id] });
    },
    onError: (error: Error, variables) => {
      setDateMessage({ bookingId: variables.id, text: error.message, isError: true });
    },
  });

  if (isLoading) return <LoadingBlock />;
  if (!bookings?.length) return <EmptyState title="No bookings yet" hint="Book a collection slot from the Book tab." />;

  const today = new Date();
  const minDate = formatDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const maxDate = formatDateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0));

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
          {["pending", "approved"].includes(b.status) && (
            <div className="mt-3 space-y-2">
              {editingId === b.id ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    min={minDate}
                    max={maxDate}
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Updated collection date"
                  />
                  <button
                    type="button"
                    onClick={() => updateDate.mutate({ id: b.id, collectionDate: editDate })}
                    disabled={!editDate || editDate === String(b.collection_date).slice(0, 10) || updateDate.isPending}
                    className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground disabled:opacity-50"
                  >
                    {updateDate.isPending ? "Saving…" : "Save date"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setDateMessage(null); }}
                    className="rounded-lg border border-input px-3 py-2 text-xs font-semibold text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditingId(b.id); setEditDate(String(b.collection_date).slice(0, 10)); setDateMessage(null); }}
                  className="rounded-lg border border-primary px-3 py-2 text-xs font-bold text-primary"
                >
                  Change collection date
                </button>
              )}
              {b.status === "pending" && !editingId && (
                <p className="text-xs text-warning-foreground">Awaiting shopkeeper approval.</p>
              )}
              {dateMessage && dateMessage.bookingId === b.id && (
                <p role={dateMessage.isError ? "alert" : "status"} className={`rounded-lg p-2 text-sm ${dateMessage.isError ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary"}`}>
                  {dateMessage.text}
                </p>
              )}
            </div>
          )}
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

type SchemeTransaction = {
  id: string;
  distribution_code: string;
  distribution_date: string;
  status: string;
  shop_name: string;
  shop_code: string;
  shop_address: string;
  district: string;
  taluka: string;
  card_category: string | null;
  booking_code: string | null;
  lifting_member: string;
  scheme_name: string | null;
  items: { item_name: string; quantity: number; unit: string }[];
};

type SchemeProfile = {
  user_id: string;
  family_size: number;
  ration_cards?: { card_category?: string | null } | null;
};

type SchemeEntitlement = {
  id: string;
  quantity_per_person: number;
  ration_items?: { item_name?: string; unit?: string } | null;
};

function SchemeTab({ profile }: { profile: SchemeProfile }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const category = profile.ration_cards?.card_category ?? undefined;
  const monthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = selectedMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const isCurrentOrFutureMonth =
    selectedMonth.getFullYear() > now.getFullYear() ||
    (selectedMonth.getFullYear() === now.getFullYear() &&
      selectedMonth.getMonth() >= now.getMonth());
  const {
    data: entitlements,
    isLoading: entitlementsLoading,
    isError: entitlementsError,
    refetch: refetchEntitlements,
  } = useQuery({
    queryKey: ["entitlements", category],
    queryFn: () =>
      apiGet<SchemeEntitlement[]>(
        `/beneficiary/entitlements?category=${encodeURIComponent(category ?? "")}`,
      ),
    enabled: Boolean(category),
  });
  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
    error: transactionsLoadError,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: ["scheme-transactions", profile.user_id, monthKey],
    queryFn: () =>
      apiGet<SchemeTransaction[]>(`/beneficiary/scheme-transactions?month=${monthKey}`),
  });
  const schemeName = category === "Yellow" ? "AAY" : category === "Orange" ? "PHH" : null;


function formatDistributionDate(value: string) {
  const parts = value.slice(0, 10).split("-").map(Number);

  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  return new Date(year, month - 1, day).toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


  return (
    <div className="space-y-4">
      <section className="annaseva-card overflow-hidden">
        <div className="bg-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                Your ration scheme
              </p>
              <h2 className="text-2xl font-bold">{schemeName ?? "Scheme not assigned"}</h2>
            </div>
            <p className="ml-auto rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
              {category ? `${category} card` : "No card category"}
            </p>
          </div>
          <p className="mt-3 text-sm opacity-85">
            {schemeName === "AAY"
              ? "Antyodaya Anna Yojana"
              : schemeName === "PHH"
                ? "Priority Household"
                : "Scheme information will appear when your ration-card category is available."}
          </p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-foreground">Monthly entitlement</h3>
              <p className="text-xs text-muted-foreground">
                For your household of {profile.family_size}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">per month</span>
          </div>
          {entitlementsError ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              Could not load scheme entitlements.
              <button
                type="button"
                onClick={() => refetchEntitlements()}
                className="font-semibold underline"
              >
                Retry
              </button>
            </div>
          ) : entitlementsLoading ? (
            <LoadingBlock label="Loading entitlements…" />
          ) : entitlements?.some((rule) => rule.quantity_per_person > 0) ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {entitlements
                .filter((rule) => rule.quantity_per_person > 0)
                .map((rule) => (
                  <div key={rule.id} className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">{rule.ration_items?.item_name}</p>
                    <p className="mt-1 font-bold text-foreground">
                      {(rule.quantity_per_person * profile.family_size).toFixed(1)}{" "}
                      {rule.ration_items?.unit}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No monthly entitlement details are available for this card.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-foreground">Sale receipts & previous transactions</h2>
            <p className="text-xs text-muted-foreground">
              Completed ration distributions for your household
            </p>
          </div>
        </div>
        <div className="mb-3 flex items-center justify-between rounded-xl bg-accent px-3 py-2 text-accent-foreground">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setSelectedMonth(
                new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1),
              )
            }
            className="rounded-lg p-2 transition hover:bg-black/5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="font-bold">{monthLabel}</p>
            <p className="text-xs">Distribution history</p>
          </div>
          <button
            type="button"
            aria-label="Next month"
            disabled={isCurrentOrFutureMonth}
            onClick={() =>
              setSelectedMonth(
                new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1),
              )
            }
            className="rounded-lg p-2 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {transactionsError ? (
          <div
            role="alert"
            className="annaseva-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-destructive"
          >
            <span>
              {transactionsLoadError instanceof Error
                ? transactionsLoadError.message
                : "Could not load transaction history."}
            </span>
            <button
              type="button"
              onClick={() => refetchTransactions()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : transactionsLoading ? (
          <LoadingBlock label="Loading transactions…" />
        ) : transactions?.length ? (
          <div className="space-y-3">
            {transactions.map((transaction) => {
              const location = [transaction.shop_address, transaction.taluka, transaction.district]
                .filter(Boolean)
                .join(", ");
              return (
                <article key={transaction.id} className="annaseva-card overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl bg-accent px-2 text-center text-accent-foreground">
                          <span className="text-2xl font-bold leading-none">
                            {Number(transaction.distribution_date.slice(8, 10))}
                          </span>
                          <span className="mt-1 text-[11px]">
                            {transaction.distribution_date.slice(0, 7)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground">{transaction.shop_name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            FPS ID: {transaction.shop_code}
                          </p>
                          {location && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{location}</p>
                          )}
                        </div>
                      </div>
                      <StatusChip status={transaction.status} />
                    </div>
                    <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                      <p className="text-foreground">
                        <span className="font-semibold">Scheme:</span>{" "}
                        {transaction.scheme_name ?? `${transaction.card_category ?? "Ration"} card`}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold">Commodities:</span>{" "}
                        {transaction.items.length
                          ? transaction.items
                              .map((item) => `${item.item_name} ${item.quantity} ${item.unit}`)
                              .join(", ")
                          : "Item details not recorded"}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold">Lifting member:</span>{" "}
                        {transaction.lifting_member}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold">Transaction total:</span> Not recorded
                      </p>
                      <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDistributionDate(transaction.distribution_date)}
                        {transaction.booking_code ? ` · Booking ${transaction.booking_code}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border bg-muted/50 px-4 py-3 text-sm">
                    <span className="font-semibold text-foreground">Sale receipt</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {transaction.distribution_code}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={`No completed distributions for ${monthLabel}`}
            hint="Completed ration collection receipts will appear here."
          />
        )}
      </section>
    </div>
  );
}

type BeneficiaryComplaint = {
  id: string;
  category: string;
  description: string;
  status: string;
  resolution_notes: string | null;
  created_at: string;
  shop_name: string | null;
};

function ProfileTab({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("Stock not available");
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);
  const [editingComplaintId, setEditingComplaintId] = useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const cardCategory = profile.ration_cards?.card_category;
  const schemeName = profile.ration_cards?.scheme_name;
  const familyMembers = profile.ration_cards?.members ?? [];
  const shopLocation = [
    profile.fps_shops?.address,
    profile.fps_shops?.taluka,
    profile.fps_shops?.district,
  ].filter(Boolean).join(", ") || "Not on file";

  const { data: complaints, isLoading: complaintsLoading, isError: complaintsError } = useQuery({
    queryKey: ["beneficiary-complaints", profile.id],
    queryFn: () => apiGet<BeneficiaryComplaint[]>("/beneficiary/complaints"),
  });
  const refreshComplaints = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["beneficiary-complaints", profile.id] }),
      queryClient.invalidateQueries({ queryKey: ["complaints"] }),
    ]);

  const complain = useMutation({
    mutationFn: async () => {
      await apiPost("/beneficiary/complaints", {
        category,
        description,
      });
    },
    onSuccess: async () => {
      setSent(true);
      setDescription("");
      setEditingComplaintId(null);
      await refreshComplaints();
    },
  });
  const updateComplaint = useMutation({
    mutationFn: ({ id, complaintCategory, complaintDescription }: {
      id: string;
      complaintCategory: string;
      complaintDescription: string;
    }) => apiPatch(`/beneficiary/complaints/${id}`, {
      category: complaintCategory,
      description: complaintDescription,
    }),
    onSuccess: async () => {
      setSent(false);
      setEditingComplaintId(null);
      setDescription("");
      await refreshComplaints();
    },
  });
  const deleteComplaint = useMutation({
    mutationFn: (id: string) => apiDelete(`/beneficiary/complaints/${id}`),
    onSuccess: async () => {
      setDeleteConfirmationId(null);
      if (editingComplaintId === deleteConfirmationId) {
        setEditingComplaintId(null);
        setDescription("");
      }
      await refreshComplaints();
    },
  });

  return (
    <>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">Ration card</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Card number</dt>
            <dd className="text-right font-semibold text-foreground">
              {profile.ration_cards?.masked_card_number ?? "Not on file"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Card category</dt>
            <dd className="text-right font-semibold text-foreground">
              {cardCategory ?? "Not on file"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Scheme</dt>
            <dd className="text-right font-semibold text-foreground">
              {schemeName ?? "Not assigned"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Verification</dt>
            <dd>
              <StatusChip status={profile.ration_cards?.verification_status ?? "pending"} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="annaseva-card p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-bold text-foreground">Family members</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {familyMembers.length} of {profile.family_size}
          </span>
        </div>
        {familyMembers.length ? (
          <ul className="mt-3 divide-y divide-border">
            {familyMembers.map(
              (member: { id: string; full_name: string; relationship: string | null }) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{member.full_name}</span>
                  {member.relationship && (
                    <span className="text-right text-muted-foreground">{member.relationship}</span>
                  )}
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Family member names are not available in the linked ration-card records yet.
          </p>
        )}
      </div>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">Aadhaar details on file</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <dt className="text-muted-foreground">Aadhaar address</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {profile.aadhaar_address ?? "Not on file"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <dt className="text-muted-foreground">Mobile linked to Aadhaar</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {profile.aadhaar_linked_mobile ?? "Not on file"}
              </dd>
            </div>
          </div>
        </dl>
      </div>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">Fair price shop</h2>
        {profile.fps_shops ? (
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shop</dt>
              <dd className="text-right font-semibold text-foreground">
                {profile.fps_shops.shop_name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shop code</dt>
              <dd className="text-right font-semibold text-foreground">
                {profile.fps_shops.shop_code}
              </dd>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="mt-0.5 font-medium text-foreground">{shopLocation}</dd>
              </div>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Contact number</dt>
              <dd className="text-right font-semibold text-foreground">
                {profile.fps_shops.contact_number ?? "Not on file"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shop hours</dt>
              <dd className="text-right font-semibold text-foreground">
                {profile.fps_shops.operating_hours ?? "Not on file"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No fair price shop is assigned to this profile.
          </p>
        )}
      </div>
      <div className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">
          {editingComplaintId ? "Edit your complaint" : "File a complaint"}
        </h2>
        <div className="mt-3 space-y-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          >
            {[
              "Stock not available",
              "Quality issue",
              "Quantity short",
              "Behaviour issue",
              "Other",
            ].map((c) => (
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
          {sent && (
            <p className="rounded-lg bg-secondary/10 px-3 py-2 text-sm text-secondary">
              Complaint submitted. The admin team will review it.
            </p>
          )}
          {complain.isError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {complain.error.message}
            </p>
          )}
          {updateComplaint.isError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {updateComplaint.error.message}
            </p>
          )}
          <button
            onClick={() => {
              setSent(false);
              if (editingComplaintId) {
                updateComplaint.mutate({
                  id: editingComplaintId,
                  complaintCategory: category,
                  complaintDescription: description,
                });
              } else {
                complain.mutate();
              }
            }}
            disabled={
              complain.isPending || updateComplaint.isPending || description.trim().length < 5
            }
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {complain.isPending
              ? "Submitting…"
              : updateComplaint.isPending
                ? "Updating…"
                : editingComplaintId
                  ? "Update complaint"
                  : "Submit complaint"}
          </button>
          {editingComplaintId && (
            <button
              type="button"
              onClick={() => {
                setEditingComplaintId(null);
                setDescription("");
              }}
              className="w-full rounded-lg border border-input py-2.5 text-sm font-semibold text-foreground"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>
      <section className="annaseva-card p-5">
        <h2 className="font-bold text-foreground">Your feedback & complaints</h2>
        {complaintsLoading ? (
          <LoadingBlock label="Loading your complaints…" />
        ) : complaintsError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Could not load your complaints. Please refresh and try again.
          </p>
        ) : !complaints?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Your submitted complaints will appear here.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {complaints.map((complaint) => (
              <article key={complaint.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{complaint.category}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {complaint.shop_name ?? "General"} ·{" "}
                      {new Date(complaint.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusChip status={complaint.status} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {complaint.description}
                </p>
                {complaint.resolution_notes && (
                  <div className="mt-2 rounded-lg bg-muted p-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Shop response: </span>
                    {complaint.resolution_notes}
                  </div>
                )}
                {complaint.status === "open" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingComplaintId(complaint.id);
                        setCategory(complaint.category);
                        setDescription(complaint.description);
                        setSent(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmationId(complaint.id)}
                      disabled={deleteComplaint.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    This complaint is being reviewed and can no longer be edited or deleted.
                  </p>
                )}
                {deleteConfirmationId === complaint.id && (
                  <div className="mt-3 rounded-lg bg-destructive/10 p-3">
                    <p className="text-sm font-medium text-destructive">
                      Delete this complaint? This cannot be undone.
                    </p>
                    {deleteComplaint.isError && (
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {deleteComplaint.error.message}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => deleteComplaint.mutate(complaint.id)}
                        disabled={deleteComplaint.isPending}
                        className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
                      >
                        {deleteComplaint.isPending ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmationId(null)}
                        disabled={deleteComplaint.isPending}
                        className="rounded-lg border border-input px-3 py-2 text-xs font-semibold text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
