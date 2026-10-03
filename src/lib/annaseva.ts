import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export type AppRole = "beneficiary" | "shopkeeper" | "admin";
export type AppUser = { id: string; email: string; role: AppRole; full_name: string };

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiGet<{ user: AppUser | null }>("/auth/me").then((result) => result.user),
    staleTime: 60_000,
  });
}

export function roleHome(role: AppRole | null | undefined) {
  if (role === "shopkeeper") return "/shopkeeper";
  if (role === "admin") return "/admin";
  return "/beneficiary";
}

export const CARD_CATEGORIES = ["Yellow", "Orange", "White"] as const;

export const SLOTS = [
  "9:00 AM - 11:00 AM",
  "11:00 AM - 1:00 PM",
  "3:00 PM - 5:00 PM",
  "5:00 PM - 7:00 PM",
] as const;

export function bookingCode() {
  return "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function distributionCode() {
  return "DN-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
