import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

export const Route = createFileRoute("/admin-login")({
  head: () => ({ meta: [{ title: "Admin Login — AnnaSeva" }] }),
  component: AdminLoginPage,
});

type AdminLoginResult = { user: { role: string } };

function AdminLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: bootstrap, isLoading: checkingBootstrap } = useQuery({
    queryKey: ["admin-bootstrap-status"],
    queryFn: () => apiGet<{ available: boolean }>("/auth/admin-bootstrap-status"),
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await apiPost("/auth/admin-bootstrap", { email, password, fullName, mobile });
        navigate({ to: "/admin" });
        return;
      }
      const result = await apiPost<AdminLoginResult>("/auth/signin", { email, password });
      if (result.user.role !== "admin") {
        await apiPost("/auth/signout");
        setError("This account does not have administrator access.");
        setBusy(false);
        return;
      }
      navigate({ to: "/admin" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md">
        <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="annaseva-card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground">Admin Login</h1>
              <p className="text-sm text-muted-foreground">AnnaSeva district operations</p>
            </div>
          </div>
          {bootstrap?.available && (
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
              {(["signin", "signup"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`rounded-md py-2 text-sm font-semibold ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && bootstrap?.available && (
              <>
                <label className="block text-sm font-medium text-foreground">
                  Full name
                  <input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-normal" />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Mobile number
                  <input required type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-normal" />
                </label>
              </>
            )}
            <label className="block text-sm font-medium text-foreground">
              Email address
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-normal"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Password
              <input
                required
                type="password"
                minLength={mode === "signup" ? 8 : 1}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-normal"
              />
            </label>
            {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create admin account" : "Admin Login"}
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {checkingBootstrap || bootstrap?.available
              ? "Create account is available only while the first admin is being set up. Afterward, admin accounts can sign in here."
              : "The first admin account already exists. Additional admins must be provisioned by an existing administrator. Beneficiary and shopkeeper accounts cannot enter this dashboard."}
          </p>
        </div>
      </section>
    </main>
  );
}
