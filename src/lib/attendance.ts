export const DAILY_RATE_DEFAULT = 1600;

export type AttendanceStatus = "present" | "absent";

export interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  amount: number;
  advance: number;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isSunday(d: Date): boolean {
  return d.getDay() === 0;
}

export function monthRange(year: number, month: number): { start: string; end: string; days: Date[] } {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let i = 1; i <= last.getDate(); i++) days.push(new Date(year, month, i));
  return { start: ymd(first), end: ymd(last), days };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatCurrency(n: number): string {
  return "Rs " + n.toLocaleString("en-PK");
}