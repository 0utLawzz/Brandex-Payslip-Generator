import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";

import { getAttendanceRange, getSettings } from "@/lib/attendance.functions";
import { Button } from "@/components/ui/button";
import {
  DAILY_RATE_DEFAULT,
  DAY_NAMES_FULL,
  MONTH_NAMES,
  formatCurrency,
  isSunday,
  monthRange,
  ymd,
  type AttendanceRecord,
} from "@/lib/attendance";


type Search = { month?: string };

export const Route = createFileRoute("/print")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    month: typeof s.month === "string" ? s.month : undefined,
  }),
  head: () => ({ meta: [{ title: "Brandex Law Services Attendance Report" }] }),
  component: PrintPage,
});

function PrintPage() {
  const { month } = Route.useSearch();
  const now = new Date();
  const [year, monthIdx] = (() => {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      return [y, m - 1];
    }
    return [now.getFullYear(), now.getMonth()];
  })();

  const { start, end, days } = monthRange(year, monthIdx);
  const [records, setRecords] = useState<Record<string, { status: string; amount: number; advance: number }>>({});
  const [rate, setRate] = useState(DAILY_RATE_DEFAULT);
  const fetchRange = useServerFn(getAttendanceRange);
  const fetchSettings = useServerFn(getSettings);

  useEffect(() => {
    (async () => {
      const [recs, sett] = await Promise.all([
        fetchRange({ data: { start, end } }),
        fetchSettings(),
      ]);
      const map: Record<string, { status: string; amount: number; advance: number }> = {};
      recs.forEach((r) => (map[r.date] = { status: r.status, amount: r.amount, advance: r.advance ?? 0 }));
      setRecords(map);
      if (sett.daily_rate) setRate(sett.daily_rate);
    })();
  }, [start, end]);

  let present = 0, absent = 0, sundays = 0, total = 0, totalAdvance = 0;
  const rows = days.map((d) => {
    const sun = isSunday(d);
    const rec = records[ymd(d)];
    let status = "—";
    let amount = 0;
    const advance = rec?.advance ?? 0;
    if (sun) { status = "Sunday (off)"; sundays++; }
    else if (rec?.status === "present") { status = "Present"; amount = rec.amount; present++; total += amount; }
    else if (rec?.status === "absent") { status = "Absent"; absent++; }
    totalAdvance += advance;
    return { date: ymd(d), day: DAY_NAMES_FULL[d.getDay()], status, amount, advance, sun };
  });

  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/"><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></Link>
          <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        </div>

        <header className="mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold">Brandex Law Services</h1>
          <h2 className="text-lg font-semibold">Attendance Report</h2>
          <p className="text-sm text-gray-600">{monthLabel} &middot; Daily rate: {formatCurrency(rate)}</p>
        </header>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Day</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2 text-right">Amount</th>
              <th className="py-2 pr-2 text-right">Advance</th>
              <th className="py-2 pr-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className={"border-b border-gray-200 " + (r.sun ? "text-gray-500" : "")}>
                <td className="py-1.5 pr-2">{r.date}</td>
                <td className="py-1.5 pr-2">{r.day}</td>
                <td className="py-1.5 pr-2">{r.status}</td>
                <td className="py-1.5 pr-2 text-right">{r.amount ? formatCurrency(r.amount) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{r.advance ? formatCurrency(r.advance) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{(r.amount - r.advance) ? formatCurrency(r.amount - r.advance) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              <td className="py-2 pr-2" colSpan={3}>Totals</td>
              <td className="py-2 pr-2 text-right">{formatCurrency(total)}</td>
              <td className="py-2 pr-2 text-right">{formatCurrency(totalAdvance)}</td>
              <td className="py-2 pr-2 text-right">{formatCurrency(total - totalAdvance)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Summary label="Working Days" value={days.length - sundays} />
          <Summary label="Present" value={present} />
          <Summary label="Absent" value={absent} />
          <Summary label="Sundays" value={sundays} />
        </div>

        <div className="mt-8 flex justify-between border-t pt-12 text-sm text-gray-700">
          <div>
            <div className="border-t border-black pt-1">Employee Signature</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">Authorized Signature</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-gray-300 p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}