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
  type PrintRecord = { status: string; amount: number; advance: number; notes: string };
  const [records, setRecords] = useState<Record<string, PrintRecord>>({});

  const [rate, setRate] = useState(DAILY_RATE_DEFAULT);
  const fetchRange = useServerFn(getAttendanceRange);
  const fetchSettings = useServerFn(getSettings);

  useEffect(() => {
    (async () => {
      const [recs, sett] = await Promise.all([
        fetchRange({ data: { start, end } }),
        fetchSettings(),
      ]);
      const map: Record<string, PrintRecord> = {};
      recs.forEach((r: AttendanceRecord) =>
        (map[r.date] = {
          status: r.status,
          amount: r.amount,
          advance: r.advance ?? 0,
          notes: r.notes ?? "",
        })
      );
      setRecords(map);
      if (sett.daily_rate) setRate(sett.daily_rate);
    })();
  }, [start, end]);

  let present = 0,
    absent = 0,
    sundays = 0,
    total = 0,
    totalAdvance = 0;
  const rows = days.map((d) => {
    const sun = isSunday(d);
    const rec = records[ymd(d)];
    let status = "—";
    let amount = 0;
    const advance = rec?.advance ?? 0;
    const notes = rec?.notes ?? "";
    if (sun) {
      status = "Sunday (off)";
      sundays++;
    } else if (rec?.status === "present") {
      status = "Present";
      amount = rec.amount;
      present++;
      total += amount;
    } else if (rec?.status === "absent") {
      status = "Absent";
      absent++;
    }
    totalAdvance += advance;
    return { date: ymd(d), day: DAY_NAMES_FULL[d.getDay()], status, amount, advance, notes, sun };
  });

  const notesWithContent = rows.filter((r) => r.notes && !r.sun);
  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

  return (
    <div className="print-root min-h-screen bg-white text-black">
      <div className="print-sheet mx-auto max-w-[210mm] p-4 sm:p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link to="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>

        <header className="mb-3 border-b border-black pb-2">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">Brandex Law Services</h1>
          <h2 className="text-base font-semibold sm:text-lg">Attendance Report</h2>
          <p className="text-xs text-gray-600 sm:text-sm">
            {monthLabel} · Daily rate: {formatCurrency(rate)}
          </p>
        </header>

        <table className="print-table w-full border-collapse text-[11px] sm:text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1.5 pr-1.5">Date</th>
              <th className="py-1.5 pr-1.5">Day</th>
              <th className="py-1.5 pr-1.5">Status</th>
              <th className="py-1.5 pr-1.5 text-right">Amount</th>
              <th className="py-1.5 pr-1.5 text-right">Advance</th>
              <th className="py-1.5 pr-1.5 text-right">Net</th>
              <th className="py-1.5 pr-0">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.date}
                className={"border-b border-gray-200 " + (r.sun ? "text-gray-500" : "")}
              >
                <td className="py-1 pr-1.5 whitespace-nowrap">{r.date}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{r.day}</td>
                <td className="py-1 pr-1.5">{r.status}</td>
                <td className="py-1 pr-1.5 text-right whitespace-nowrap">
                  {r.amount ? formatCurrency(r.amount) : "—"}
                </td>
                <td className="py-1 pr-1.5 text-right whitespace-nowrap">
                  {r.advance ? formatCurrency(r.advance) : "—"}
                </td>
                <td className="py-1 pr-1.5 text-right whitespace-nowrap">
                  {r.amount - r.advance ? formatCurrency(r.amount - r.advance) : "—"}
                </td>
                <td className="py-1 pr-0 max-w-[8rem] truncate" title={r.notes || undefined}>
                  {r.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              <td className="py-1.5 pr-1.5" colSpan={3}>
                Totals
              </td>
              <td className="py-1.5 pr-1.5 text-right">{formatCurrency(total)}</td>
              <td className="py-1.5 pr-1.5 text-right">{formatCurrency(totalAdvance)}</td>
              <td className="py-1.5 pr-1.5 text-right">{formatCurrency(total - totalAdvance)}</td>
              <td className="py-1.5 pr-0" />
            </tr>
          </tfoot>
        </table>

        {notesWithContent.length > 0 && (
          <section className="mt-3 break-inside-avoid">
            <h3 className="text-xs font-bold uppercase tracking-wide border-b border-gray-300 pb-1 mb-1.5">
              Notes detail
            </h3>
            <ul className="text-[11px] space-y-0.5">
              {notesWithContent.map((r) => (
                <li key={r.date}>
                  <span className="font-semibold">{r.date}</span>
                  <span className="text-gray-500"> ({r.day}): </span>
                  {r.notes}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:gap-3">
          <Summary label="Working Days" value={days.length - sundays} />
          <Summary label="Present" value={present} />
          <Summary label="Absent" value={absent} />
          <Summary label="Sundays" value={sundays} />
        </div>

        <div className="mt-6 flex justify-between border-t border-black pt-8 text-xs text-gray-700 sm:text-sm">
          <div>
            <div className="border-t border-black pt-1 min-w-[7rem]">Employee Signature</div>
          </div>
          <div>
            <div className="border-t border-black pt-1 min-w-[7rem]">Authorized Signature</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-root {
            min-height: 0 !important;
            background: white !important;
          }
          .print-sheet {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .print-table {
            font-size: 9.5pt !important;
            width: 100% !important;
          }
          .print-table th,
          .print-table td {
            padding-top: 2.5px !important;
            padding-bottom: 2.5px !important;
          }
          .print-table th:last-child,
          .print-table td:last-child {
            max-width: 28mm;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .break-inside-avoid {
            break-inside: avoid;
          }
        }
        @media screen {
          .print-sheet {
            box-shadow: 0 0 0 1px #e5e5e5, 0 8px 24px rgba(0,0,0,0.06);
          }
        }
      `}</style>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-gray-300 p-2 sm:p-3">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-base font-semibold sm:text-lg">{value}</div>
    </div>
  );
}
