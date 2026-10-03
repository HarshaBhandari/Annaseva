import { createFileRoute, Link } from "@tanstack/react-router";
import { Wheat, ShieldCheck, Store, Users, Bell, CalendarCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AnnaSeva — Smart Ration Distribution & Monitoring" },
      {
        name: "description",
        content:
          "AnnaSeva brings transparency to Public Distribution System ration delivery in Maharashtra — entitlements, stock availability, slot booking, and distribution monitoring for beneficiaries, shopkeepers, and admins.",
      },
      { property: "og:title", content: "AnnaSeva — Smart Ration Distribution & Monitoring" },
      {
        property: "og:description",
        content:
          "Track entitlements, check fair price shop stock, book collection slots, and monitor ration distribution — free for beneficiaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Wheat, title: "My Entitlement", text: "See exactly what your ration card category entitles your family to, every month." },
  { icon: Store, title: "Live Shop Stock", text: "Check grain, sugar, and oil availability at your fair price shop before you visit." },
  { icon: CalendarCheck, title: "Slot Booking", text: "Book a collection slot and skip the queue with a digital booking code." },
  { icon: ShieldCheck, title: "Transparent Records", text: "Every distribution is recorded with a digital receipt you can verify." },
  { icon: Bell, title: "Alerts & Complaints", text: "Get notified about bookings and raise complaints that reach the admin." },
  { icon: Users, title: "Three Roles", text: "Separate dashboards for beneficiaries, shopkeepers, and administrators." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="annaseva-gradient-header px-4 pb-14 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <Wheat className="h-5 w-5 text-accent-foreground" />
            </span>
            <span className="text-lg font-bold">AnnaSeva</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin-login"
              className="inline-flex items-center gap-2 rounded-lg border border-primary-foreground/35 px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
            >
              <ShieldCheck className="h-4 w-4" /> Admin Login
            </Link>
            <Link
              to="/auth"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Demo project · synthetic data</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">
            Smart Ration Distribution &amp; Monitoring
          </h1>
          <p className="mt-3 max-w-xl text-sm opacity-90 md:text-base">
            A transparent, free-ration distribution system for Fair Price Shops in Maharashtra. Know your
            entitlement, check stock, book a slot, and get a digital receipt — no payments, ever.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground shadow-lg transition hover:opacity-90"
            >
              Get started
            </Link>
            <a
              href="#roles"
              className="rounded-xl border border-primary-foreground/40 px-5 py-3 text-sm font-semibold transition hover:bg-primary-foreground/10"
            >
              See the roles
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-10">
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="annaseva-card p-4">
              <f.icon className="h-6 w-6 text-secondary" />
              <h3 className="mt-2 font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-3xl px-4 pb-14">
        <h2 className="text-xl font-bold text-foreground">Built for everyone in the chain</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { name: "Beneficiary", text: "View entitlements, book slots, track bookings, file complaints." },
            { name: "Shopkeeper", text: "Manage shop stock, approve bookings, record distributions." },
            { name: "Admin", text: "Monitor shops, stock levels, AI demand forecasts, and complaints." },
          ].map((r) => (
            <div key={r.name} className="annaseva-card border-t-4 border-t-secondary p-4">
              <h3 className="font-semibold text-foreground">{r.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          AnnaSeva is a college engineering demo project. It is not affiliated with or endorsed by any government
          body, and all data shown is synthetic.
        </p>
      </section>
    </div>
  );
}
