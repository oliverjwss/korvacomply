import "server-only";

import Holidays from "date-holidays";
import type { SLAType } from "@/types/comply";
import {
  addUtcCalendarDays,
  endOfUtcDay,
  formatDateOnly,
  pickSlaType,
  startOfUtcDay,
} from "@/lib/sla-shared";

const ukHolidays = new Holidays("GB");

export interface SLACalculation {
  sla_type: SLAType;
  sla_deadline: Date;
  warning_date: Date;
  critical_date: Date;
}

export function isUkBusinessDay(d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hs = ukHolidays.isHoliday(d);
  if (Array.isArray(hs) ? hs.length > 0 : Boolean(hs)) return false;
  return true;
}

/** If d is not a UK business day, advance to the next one. */
export function adjustDeadlineToNextUkBusinessDay(d: Date): Date {
  let x = startOfUtcDay(d);
  while (!isUkBusinessDay(x)) {
    x = addUtcCalendarDays(x, 1);
  }
  return x;
}

/**
 * The calendar date that is the `count`th UK business day on or after `from`,
 * where the day of `from` counts as business day 1 if it is a business day.
 */
export function addUkBusinessDaysInclusive(from: Date, count: number): Date {
  if (count <= 0) return startOfUtcDay(from);
  let d = startOfUtcDay(from);
  let seen = 0;
  while (seen < count) {
    if (isUkBusinessDay(d)) {
      seen++;
      if (seen === count) return d;
    }
    d = addUtcCalendarDays(d, 1);
  }
  return d;
}

/**
 * DISP 1.5: "close of the third business day after the day on which it is
 * received".
 */
export function endOfThirdBusinessDayAfterReceipt(receivedAt: Date): Date {
  let d = addUtcCalendarDays(startOfUtcDay(receivedAt), 1);
  while (!isUkBusinessDay(d)) {
    d = addUtcCalendarDays(d, 1);
  }
  const third = addUkBusinessDaysInclusive(d, 3);
  return endOfUtcDay(third);
}

export function computeThreeDayResolved(
  receivedAt: Date,
  resolvedAt: Date
): boolean {
  const boundary = endOfThirdBusinessDayAfterReceipt(receivedAt);
  return resolvedAt.getTime() <= boundary.getTime();
}

export function calculateSLA(
  received_at: Date,
  regulated_activities: string[],
  complaint_product_area: string,
  complaint_category: string,
  options?: { psr_exceptional_circumstances?: boolean }
): SLACalculation {
  const sla_type = pickSlaType({
    regulatedActivities: regulated_activities,
    category: complaint_category,
    productArea: complaint_product_area,
    psrExceptionalCircumstances: options?.psr_exceptional_circumstances,
  });

  const start = startOfUtcDay(received_at);
  let rawDeadline: Date;

  switch (sla_type) {
    case "psr_15_day":
      rawDeadline = addUkBusinessDaysInclusive(start, 15);
      break;
    case "psr_35_day":
      rawDeadline = addUkBusinessDaysInclusive(start, 35);
      break;
    case "standard_8_week":
    default:
      rawDeadline = addUtcCalendarDays(start, 56);
      break;
  }

  const sla_deadline = adjustDeadlineToNextUkBusinessDay(rawDeadline);
  const windowStart = start.getTime();
  const windowEnd = sla_deadline.getTime();
  const span = Math.max(86_400_000, windowEnd - windowStart);
  const warning_date = new Date(windowStart + span * 0.75);
  const critical_date = new Date(windowStart + span * 0.9);

  return {
    sla_type,
    sla_deadline,
    warning_date,
    critical_date,
  };
}

export function computeSlaDeadline(
  receivedAt: Date,
  slaType: SLAType
): Date {
  const start = startOfUtcDay(receivedAt);
  let rawDeadline: Date;
  switch (slaType) {
    case "psr_15_day":
      rawDeadline = addUkBusinessDaysInclusive(start, 15);
      break;
    case "psr_35_day":
      rawDeadline = addUkBusinessDaysInclusive(start, 35);
      break;
    case "standard_8_week":
    default:
      rawDeadline = addUtcCalendarDays(start, 56);
      break;
  }
  return adjustDeadlineToNextUkBusinessDay(rawDeadline);
}
