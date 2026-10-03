import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { apiGet } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { user } = await apiGet<{ user: { id: string; email: string; role: "beneficiary" | "shopkeeper" | "admin"; full_name: string } | null }>("/auth/me");
      if (!user) throw redirect({ to: "/auth" });
      return { user };
    } catch (error) {
      if (error && typeof error === "object" && "options" in error) throw error;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
