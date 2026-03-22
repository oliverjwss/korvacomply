import type { SLAType, SLAStatus } from "@/types/comply";

export const MS_DAY = 86_400_000;

/** Payment-related categories under typical PSR / e-money complaint handling. */
const PAYMENT_COMPLAINT_CATEGORIES = new Set([
  "payments_cards",
  "payments_app",
  "emoney_access",
]);

function isPaymentProductArea(productArea: string): boolean {
  return (
    productArea.startsWith("pa_") ||
    productArea.startsWith("em_") ||
    productArea === "em_issue" ||
    productArea === "em_wallet"
  );
}

/**
 * True when the firm may be subject to PSR complaint timelines and the ticket
 * theme relates to payment services / e-money (not a legal determination).
 */
export function isPsrStyleComplaint(
  category: string,
  productArea: string
): boolean {
  if (PAYMENT_COMPLAINT_CATEGORIES.has(category)) return true;
  if (isPaymentProductArea(productArea)) return true;
  return false;
}

function holdsPsrPermission(regulatedActivities: string[] | null | undefined) {
  const a = regulatedActivities ?? [];
  return a.includes("payment_services") || a.includes("e_money");
}

export function pickSlaType(params: {
  regulatedActivities: string[] | null | undefined;
  category: string;
  productArea: string;
  psrExceptionalCircumstances?: boolean;
}): SLAType {
  const psrFirm = holdsPsrPermission(params.regulatedActivities);
  const paymentRelated = isPsrStyleComplaint(
    params.category,
    params.productArea
  );
  if (psrFirm && paymentRelated) {
    if (params.psrExceptionalCircumstances) return "psr_35_day";
    return "psr_15_day";
  }
  return "standard_8_week";
}

export function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function endOfUtcDay(d: Date): Date {
  const s = startOfUtcDay(d);
  return new Date(s.getTime() + MS_DAY - 1);
}

export function addUtcCalendarDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Calendar days between two UTC midnights (inclusive span for SLA window). */
export function calendarDaysBetweenUtcMidnight(a: Date, b: Date): number {
  const ta = startOfUtcDay(a).getTime();
  const tb = startOfUtcDay(b).getTime();
  return Math.round((tb - ta) / MS_DAY);
}

/**
 * M2 status: compare "days remaining" to total window (calendar days from
 * receipt to deadline). ≤10% remaining or past deadline → breached;
 * ≤25% but >10% → at_risk; else on_track.
 */
export function computeSlaStatusProgress(
  receivedAt: Date,
  deadline: Date,
  now = new Date()
): SLAStatus {
  const start = startOfUtcDay(receivedAt).getTime();
  const end = startOfUtcDay(deadline).getTime();
  const today = startOfUtcDay(now).getTime();

  const totalDays = Math.max(
    1,
    calendarDaysBetweenUtcMidnight(new Date(start), new Date(end))
  );
  const remainingDays = Math.round((end - today) / MS_DAY);

  if (remainingDays < 0) return "breached";
  const remFrac = remainingDays / totalDays;
  if (remFrac <= 0.1) return "breached";
  if (remFrac <= 0.25) return "at_risk";
  return "on_track";
}

export function daysRemainingUntilDeadline(
  deadline: Date,
  now = new Date()
): number {
  return Math.round(
    (startOfUtcDay(deadline).getTime() - startOfUtcDay(now).getTime()) / MS_DAY
  );
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
