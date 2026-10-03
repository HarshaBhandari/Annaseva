import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Wheat } from "lucide-react";
import { apiPost } from "@/lib/api";
import { roleHome, type AppRole } from "@/lib/annaseva";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AnnaSeva" },
      { name: "description", content: "Sign in or create your AnnaSeva account as a beneficiary, shopkeeper, or admin." },
      { property: "og:title", content: "Sign in — AnnaSeva" },
      { property: "og:description", content: "Access your AnnaSeva ration distribution dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const ROLES: { id: Exclude<AppRole, "admin">; label: string; hint: string }[] = [
  { id: "beneficiary", label: "Beneficiary", hint: "Ration card holder" },
  { id: "shopkeeper", label: "Shopkeeper", hint: "Fair price shop owner" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<AppRole>("beneficiary");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { user } = await apiPost<{ user: { role: AppRole } }>("/auth/signin", { email, password });
      setBusy(false);
      navigate({ to: roleHome(user.role) });
    } catch (error) {
      setBusy(false);
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not sign in." });
      return;
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/auth/signup", { email, password, fullName, mobile, role });
      setBusy(false);
      navigate({ to: roleHome(role) });
    } catch (error) {
      setBusy(false);
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not create account." });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Wheat className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="text-xl font-bold text-foreground">AnnaSeva</span>
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">Smart Ration Distribution &amp; Monitoring</p>
        </div>

        <div className="annaseva-card p-6">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setMessage(null);
                }}
                className={`rounded-md py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
            {mode === "signup" && (
              <>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Mobile number"
                  inputMode="tel"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">I am a…</p>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLES.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setRole(r.id)}
                        className={`rounded-lg border px-2 py-2 text-center transition ${
                          role === r.id
                            ? "border-primary bg-primary/5"
                            : "border-input hover:border-primary/50"
                        }`}
                      >
                        <span className="block text-xs font-bold text-foreground">{r.label}</span>
                        <span className="block text-[10px] text-muted-foreground">{r.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {message && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  message.kind === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-secondary/10 text-secondary"
                }`}
              >
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Administrator?{" "}
          <Link to="/admin-login" className="font-semibold text-primary underline-offset-4 hover:underline">
            Admin Login
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo project with synthetic data. Ration is always free — no payments exist in this app.
        </p>
      </div>
    </div>
  );
}
