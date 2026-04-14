import { addDays } from "date-fns";
import { parseDateWithoutTimezone } from "@/lib/date-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function toLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function enumerateEventDisplayDays(startInput: Date | string, endInput?: Date | string | null) {
  const startDate = parseDateWithoutTimezone(startInput);
  if (!startDate) return [];

  const startDay = startOfLocalDay(startDate);
  if (!endInput) return [startDay];

  const endDate = parseDateWithoutTimezone(endInput);
  if (!endDate || endDate.getTime() <= startDate.getTime()) {
    return [startDay];
  }

  if (endDate.getTime() - startDate.getTime() <= DAY_MS) {
    return [startDay];
  }

  const endDay = startOfLocalDay(endDate);
  const days: Date[] = [];
  let currentDay = startDay;

  while (currentDay.getTime() <= endDay.getTime()) {
    days.push(new Date(currentDay));
    currentDay = addDays(currentDay, 1);
  }

  return days;
}
