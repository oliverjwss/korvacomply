import type { SLAType, SLAStatus } from "@/types/comply";

const MS_DAY = 86_400_000;

function addCalendarDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function pickSlaType(params: {
  regulatedActivities: string[] | null | undefined;
  category: string;
  subcategory: string;
}): SLAType {
  const psr = params.regulatedActivities?.includes("payment_services");
  const paymentsTheme =
    params.category.startsWith("payments_") ||
    params.category === "payments_cards" ||
    params.category === "payments_app";
  if (psr && paymentsTheme) {
    const appRelated =
      params.subcategory === "pay_app_reimb" ||
      params.subcategory === "pay_scam" ||
      params.category === "payments_app";
    return appRelated ? "psr_15_day" : "psr_35_day";
  }
  return "standard_8_week";
}

export function computeSlaDeadline(
  receivedAt: Date,
  slaType: SLAType
): Date {
  const start = startOfUtcDay(receivedAt);
  switch (slaType) {
    case "psr_15_day":
      return addCalendarDays(start, 15);
    case "psr_35_day":
      return addCalendarDays(start, 35);
    case "standard_8_week":
    default:
      return addCalendarDays(start, 56);
  }
}

export function computeSlaStatus(deadline: Date, now = new Date()): SLAStatus {
  const d0 = startOfUtcDay(deadline).getTime();
  const n0 = startOfUtcDay(now).getTime();
  if (n0 > d0) return "breached";
  const atRiskFrom = d0 - 7 * MS_DAY;
  if (n0 >= atRiskFrom) return "at_risk";
  return "on_track";
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
