import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Settings as SettingsIcon,
  ArrowUpFromLine,
  ArrowDownToLine,
  Check,
  X,
  Wallet,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import {
  deleteAttendanceDay,
  getAttendanceRange,
  getAllAttendance,
  getSettings,
  updateSettings,
  upsertAttendanceDay,
  bulkUpsertAttendanceFromSheet,
} from "@/lib/attendance.functions";
import { pushMonthToSheet, pullMonthFromSheet } from "@/lib/sync.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DAILY_RATE_DEFAULT,
  DAY_NAMES,
  DAY_NAMES_FULL,
  MONTH_NAMES,
  formatCurrency,
  isSunday,
  monthRange,
  ymd,
  type AttendanceRecord,
  type AttendanceStatus,
} from "@/lib/attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { name: "description", content: "Brandex Law Associates - Employee Salary Management System." },
      { property: "og:title", content: "NADEEM'S SALARY RECORD" },
      { property: "og:description", content: "Brandex Law Associates - Employee Salary Management System." },
    ],
  }),
  component: Dashboard,
});

interface Settings {
  spreadsheet_id: string | null;
  sheet_name: string | null;
  daily_rate: number;
}

function Dashboard() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [settings, setSettings] = useState<Settings>({
    spreadsheet_id: null,
    sheet_name: "Attendance",
    daily_rate: DAILY_RATE_DEFAULT,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  const fetchRange = useServerFn(getAttendanceRange);
  const fetchSettings = useServerFn(getSettings);
  const sync = useServerFn(getAllAttendance);
  const removeAttendanceDay = useServerFn(deleteAttendanceDay);
  const saveAttendanceDay = useServerFn(upsertAttendanceDay);
  const pushSheet = useServerFn(pushMonthToSheet);
  const pullSheet = useServerFn(pullMonthFromSheet);
  const applySheet = useServerFn(bulkUpsertAttendanceFromSheet);

  const { start, end, days } = useMemo(
    () => monthRange(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  const loadRecords = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchRange({ data: { start, end } });
      const map: Record<string, AttendanceRecord> = {};
      data.forEach((r) => (map[r.date] = r as AttendanceRecord));
      setRecords(map);
    } catch (e: any) {
      if (!silent) {
        toast.error("Failed to load records: " + (e?.message ?? "unknown error"));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadSettings = async () => {
    const data = await fetchSettings();
    setSettings({
      spreadsheet_id: data.spreadsheet_id,
      sheet_name: data.sheet_name ?? "Attendance",
      daily_rate: data.daily_rate ?? DAILY_RATE_DEFAULT,
    });
  };

  useEffect(() => {
    loadSettings();
  }, []);
  useEffect(() => {
    loadRecords();
  }, [start, end]);

  const handleSync = async (silent = false) => {
    if (!settings.spreadsheet_id) {
      if (!silent) {
        toast.error("Add a Spreadsheet ID in Settings first.");
        setSettingsOpen(true);
      }
      return;
    }
    setSyncing(true);
    try {
      await sync();
      await loadRecords(true);
      if (!silent) {
        toast.success("Sync complete!");
      }
    } catch (e: any) {
      if (!silent) {
        toast.error("Sync failed: " + (e?.message ?? "unknown error"));
      }
    } finally {
      setSyncing(false);
    }
  };

  // Background Auto-Sync Trigger
  useEffect(() => {
    if (!settings.spreadsheet_id) return;

    handleSync(true);

    const interval = setInterval(() => {
      handleSync(true);
    }, 30000); // every 30 seconds

    return () => clearInterval(interval);
  }, [settings.spreadsheet_id, settings.sheet_name]);

  const saveDay = async (date: Date, status: AttendanceStatus | null, advance: number): Promise<void> => {
    if (isSunday(date)) return;
    const key = ymd(date);
    if (status === null && advance === 0) {
      try {
        await removeAttendanceDay({ data: { date: key } });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to clear day");
        return;
      }
      const next = { ...records };
      delete next[key];
      setRecords(next);
      handleSync(true);
      return;
    }
    const effectiveStatus: AttendanceStatus = status ?? "absent";
    const amount = effectiveStatus === "present" ? settings.daily_rate : 0;
    try {
      const data = await saveAttendanceDay({
        data: { date: key, status: effectiveStatus, amount, advance },
      });
      setRecords({ ...records, [key]: data as AttendanceRecord });
      handleSync(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save day");
    }
  };

  // Stats
  const stats = useMemo(() => {
    let workingDays = 0,
      present = 0,
      absent = 0,
      earnings = 0,
      advances = 0;
    days.forEach((d) => {
      if (isSunday(d)) return;
      workingDays++;
      const r = records[ymd(d)];
      if (r?.status === "present") {
        present++;
        earnings += r.amount;
      } else if (r?.status === "absent") absent++;
      if (r?.advance) advances += r.advance;
    });
    return {
      workingDays,
      present,
      absent,
      unmarked: workingDays - present - absent,
      earnings,
      advances,
      net: earnings - advances,
    };
  }, [days, records]);

  // One tab per month, e.g. "Attendance 2026-08"
  const tabPrefix = (settings.sheet_name ?? "Attendance").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "Attendance";
  const tabName = `${tabPrefix} ${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  const requireSheet = () => {
    if (!settings.spreadsheet_id) {
      toast.error("Add a Spreadsheet ID in Settings first.");
      setSettingsOpen(true);
      return false;
    }
    return true;
  };

  // App -> Sheet (this month only, own tab)
  const handlePush = async () => {
    if (!requireSheet()) return;
    setSyncing(true);
    try {
      const rows: Array<Array<string | number>> = [["Date", "Day", "Status", "Amount (Rs)", "Advance (Rs)", "Net (Rs)"]];
      days.forEach((d) => {
        if (isSunday(d)) return;
        const key = ymd(d);
        const r = records[key];
        const amount = r?.amount ?? 0;
        const adv = r?.advance ?? 0;
        rows.push([key, DAY_NAMES_FULL[d.getDay()], r?.status ?? "", amount, adv, amount - adv]);
      });
      rows.push([]);
      rows.push(["TOTAL", "", `${stats.present} present / ${stats.absent} absent`, stats.earnings, stats.advances, stats.net]);
      await pushSheet({ data: { spreadsheetId: settings.spreadsheet_id!, tabName, rows } });
      toast.success(`Pushed ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()} to sheet tab "${tabName}".`);
    } catch (e: any) {
      toast.error("Push failed: " + (e?.message ?? "unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  // Sheet -> App (this month's tab overwrites local records for that month)
  const handlePull = async () => {
    if (!requireSheet()) return;
    setPulling(true);
    try {
      const res = await pullSheet({ data: { spreadsheetId: settings.spreadsheet_id!, tabName } });
      if (!res.found) {
        toast.error(`No tab "${tabName}" in the spreadsheet yet. Push first.`);
        return;
      }
      const upserts: Array<{ date: string; status: "present" | "absent"; amount: number; advance: number }> = [];
      const deletions: string[] = [];
      for (const row of res.rows) {
        const date = (row[0] ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (date < start || date > end) continue;
        const statusRaw = (row[2] ?? "").trim().toLowerCase();
        const advance = Math.max(0, Math.round(Number(row[4]) || 0));
        let effective: "present" | "absent" | null = null;
        if (statusRaw.includes("present") || statusRaw === "pr" || statusRaw === "p") {
          effective = "present";
        } else if (statusRaw.includes("absent") || statusRaw === "ab" || statusRaw === "a") {
          effective = "absent";
        }

        if (!effective) {
          if (advance === 0) {
            deletions.push(date);
            continue;
          } else {
            effective = "present";
          }
        }

        upserts.push({
          date,
          status: effective,
          amount: effective === "present" ? settings.daily_rate : 0,
          advance,
        });
      }
      await applySheet({ data: { start, end, rows: upserts, deletions } });
      await loadRecords();
      toast.success(`Pulled ${upserts.length} day(s) from "${tabName}".`);
    } catch (e: any) {
      toast.error("Pull failed: " + (e?.message ?? "unknown error"));
    } finally {
      setPulling(false);
    }
  };

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  // Calendar grid: pad start with empty cells
  const firstDow = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const cells: Array<Date | null> = [...Array(firstDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const monthParam = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-[#fcfcfc] p-4 md:p-8 font-mono text-neutral-900 selection:bg-neutral-950 selection:text-white">
      <Toaster richColors position="top-center" />

      {/* Outer technical wrapper */}
      <div className="mx-auto max-w-6xl border border-neutral-300 bg-white shadow-sm flex flex-col md:flex-row overflow-hidden relative">
        {/* Architectural layout details */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-neutral-400"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-neutral-400"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-neutral-400"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-neutral-400"></div>

        {/* Sidebar / Control Panel */}
        <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 bg-neutral-50 p-6 flex flex-col justify-between gap-8">
          <div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1.5">[SYS_IDENTIFICATION]</div>
            <h1 className="text-2xl font-black uppercase leading-[1.1] tracking-tight text-neutral-950">
              BRANDEX <span className="font-light">LAW ASSOCIATES</span>
            </h1>
            <p className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider mt-1 mb-3">
              EMPLOYEE SALARY MANAGEMENT SYSTEM <span className="text-neutral-400 font-normal">v1.0.0</span>
            </p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest border-t border-neutral-200 pt-3 mt-3">
              DAILY RATE: {formatCurrency(settings.daily_rate)}
            </p>

            <div className="mt-8 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <BrutalButton onClick={handlePush} disabled={syncing || pulling}>
                  <ArrowUpFromLine className={"h-4 w-4 " + (syncing ? "animate-pulse" : "")} />
                  {syncing ? "…" : "Push"}
                </BrutalButton>
                <BrutalButton onClick={handlePull} disabled={syncing || pulling}>
                  <ArrowDownToLine className={"h-4 w-4 " + (pulling ? "animate-pulse" : "")} />
                  {pulling ? "…" : "Pull"}
                </BrutalButton>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/60 -mt-1">Tab: {tabName}</p>
              <Link to="/print" search={{ month: monthParam }} className="block">
                <WireframeButton>
                  <Printer className="h-3.5 w-3.5" />
                  GENERATE PDF
                </WireframeButton>
              </Link>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <WireframeButton>
                    <SettingsIcon className="h-3.5 w-3.5" />
                    CONFIG PANEL
                  </WireframeButton>
                </DialogTrigger>
                <SettingsDialog settings={settings} onSaved={(s) => { setSettings(s); setSettingsOpen(false); }} />
              </Dialog>
            </div>
          </div>

          <div className="text-white p-5 border border-neutral-800" style={{ background: "oklch(0.14 0.04 175)" }}>
            <p className="text-[9px] uppercase opacity-50 tracking-wider font-semibold">[CURRENT_PERIOD]</p>
            <p className="text-xl tracking-tight uppercase font-medium mt-1">{monthLabel}</p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={goPrev}
                className="flex-1 border border-neutral-700 py-1 text-xs font-bold hover:bg-neutral-700 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4 mx-auto" />
              </button>
              <button
                onClick={goToday}
                className="flex-1 border border-neutral-700 py-1 text-[9px] font-bold uppercase hover:bg-neutral-700 transition-colors"
              >
                TODAY
              </button>
              <button
                onClick={goNext}
                className="flex-1 border border-neutral-700 py-1 text-xs font-bold hover:bg-neutral-700 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4 mx-auto" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Dashboard Panel */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Monochromatic Stats Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-neutral-200">
            <StatBlock label="WORKING_DAYS" value={stats.workingDays} />
            <StatBlock label="STATUS_PRESENT" value={stats.present} />
            <StatBlock label="STATUS_ABSENT" value={stats.absent} />
            <StatBlock label="EST_EARNINGS" value={formatCurrency(stats.earnings)} />
          </div>

          {/* Calendar Grid + Finance Ledger */}
          <div className="flex flex-col lg:flex-row flex-1 min-w-0">
            {/* Grid display */}
            <div className="flex-1 p-6 min-w-0">
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((d, i) => (
                  <div
                    key={d}
                    className={
                      "text-center font-bold uppercase text-[9px] tracking-wider pb-2 border-b border-neutral-100 " +
                      (i === 0 ? "text-neutral-400 font-normal" : "text-neutral-900")
                    }
                  >
                    {d}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="aspect-square border border-neutral-100 bg-neutral-50/50" />;
                  return (
                    <DayCell
                      key={i}
                      date={d}
                      record={records[ymd(d)]}
                      isToday={ymd(d) === ymd(today)}
                      disabled={loading}
                      onSave={saveDay}
                    />
                  );
                })}
              </div>

              {/* Minimalist Legend */}
              <div className="mt-6 flex flex-wrap items-center gap-4 text-[9px] uppercase tracking-wider text-neutral-500">
                <LegendDot style={{ background: "oklch(0.42 0.09 175)" }} label="Present" />
                <LegendDot className="border border-rose-400 bg-rose-50 text-rose-700" label="Absent" />
                <LegendDot className="bg-neutral-100" label="Sunday (Off)" />
                <span className="ml-auto text-neutral-400 font-light">[TAP DAY CELL TO CONFIGURE]</span>
              </div>
            </div>

            <div className="w-full lg:w-72 shrink-0 border-t-4 lg:border-t-0 lg:border-l-4 border-black bg-black text-white p-6 flex flex-col gap-6">
              <div>
                <p className="text-[10px] uppercase text-neutral-400 tracking-widest">Month Progress</p>
                <div className="mt-2 h-3 w-full border-2 border-white/30">
                  <div
                    className="h-full bg-brutal-green"
                    style={{ width: `${stats.workingDays ? ((stats.present + stats.absent) / stats.workingDays) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[10px] uppercase text-neutral-500 tracking-widest tabular-nums">
                  {stats.present + stats.absent}/{stats.workingDays} days logged
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="border-2 border-white/25 py-2">
                  <p className="text-[9px] uppercase text-neutral-400 tracking-widest">Gross</p>
                  <p className="font-display text-lg font-black tabular-nums whitespace-nowrap">{formatCurrency(stats.earnings)}</p>
                </div>
                <div className="border-2 border-white/25 py-2">
                  <p className="text-[9px] uppercase text-neutral-400 tracking-widest">Rate</p>
                  <p className="font-display text-lg font-black tabular-nums whitespace-nowrap">{formatCurrency(settings.daily_rate)}</p>
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[10px] uppercase text-neutral-400 tracking-widest">Advance</p>
                <p className="font-display text-2xl font-black mt-1 tabular-nums whitespace-nowrap">{formatCurrency(stats.advances)}</p>
              </div>
              <div className="pt-5 border-t border-neutral-200">
                <p className="text-[9px] uppercase text-neutral-400 tracking-widest">[NET_SALARY]</p>
                <p className="text-2xl font-bold mt-1 leading-[0.95] tabular-nums" style={{ color: "oklch(0.40 0.09 175)" }}>
                  {formatCurrency(stats.net)}
                </p>
                <p className="mt-3 text-[9px] uppercase tracking-wider" style={{ color: stats.unmarked > 0 ? "oklch(0.55 0.09 175)" : "oklch(0.55 0.09 175)" }}>
                  {stats.unmarked > 0 ? `${stats.unmarked} UNMARKED` : "ALL RECORDS SYNCED"}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function BrutalButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 border border-black bg-black px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition-all hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function WireframeButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 px-4 bg-white border border-neutral-300 font-bold uppercase text-[10px] tracking-wider flex items-center justify-center gap-2 transition-all hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function StatBlock({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="p-5 border-r border-neutral-200 last:border-r-0 bg-white">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">{`[${label}]`}</div>
      <div className="text-xl font-bold mt-1.5 tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}

function LegendDot({ className, style, label }: { className?: string; style?: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={"inline-block h-2.5 w-2.5 " + (className ?? "")} style={style} />
      <span>{label}</span>
    </span>
  );
}

function DayCell({
  date,
  record,
  isToday,
  disabled,
  onSave,
}: {
  date: Date;
  record?: AttendanceRecord;
  isToday: boolean;
  disabled: boolean;
  onSave: (date: Date, status: AttendanceStatus | null, advance: number) => Promise<void>;
}) {
  const sunday = isSunday(date);
  const [open, setOpen] = useState(false);
  const [advance, setAdvance] = useState<number>(record?.advance ?? 0);

  useEffect(() => {
    setAdvance(record?.advance ?? 0);
  }, [record?.advance]);

  const pickStatus = async (status: AttendanceStatus | null) => {
    await onSave(date, status, advance);
    setOpen(false);
  };

  const saveAdvanceOnly = async () => {
    await onSave(date, record?.status ?? null, advance);
    setOpen(false);
  };

  const presentStyle = record?.status === "present" ? { background: "oklch(0.42 0.09 175)", color: "white" } : {};
  const todayRingClass = isToday && !sunday ? "ring-1 ring-offset-1" : "";
  const todayRingStyle = isToday && !sunday ? { ringColor: "oklch(0.55 0.09 175)", outline: "1.5px solid oklch(0.55 0.09 175)", outlineOffset: "2px" } : {};

  const cellClass = [
    "relative flex aspect-square flex-col items-start justify-between p-2 text-xs border transition-all",
    "disabled:cursor-not-allowed",
    sunday
      ? "bg-neutral-50 border-neutral-200 text-neutral-300 font-light"
      : record?.status === "present"
      ? "border-emerald-800 font-bold"
      : record?.status === "absent"
      ? "bg-rose-50/90 border-rose-400 text-rose-950 font-bold"
      : "bg-white border-neutral-200 text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400",
    todayRingClass,
  ].join(" ");

  if (sunday) {
    return (
      <button
        disabled
        className={cellClass + " overflow-hidden"}
        title="Sunday (off)"
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, transparent 0 5px, rgba(0,0,0,0.03) 5px 6px)",
        }}
      >
        <span className="text-[10px]">{date.getDate()}</span>
        <span className="text-[8px] opacity-40 uppercase tracking-widest">OFF</span>
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button disabled={disabled} className={cellClass} style={{ ...presentStyle, ...todayRingStyle }}>
          <span className="text-[11px] leading-none">{date.getDate()}</span>
          <div className="flex w-full items-end justify-between">
            <span className="text-[7px] uppercase tracking-wider opacity-65">
              {record?.status === "present" ? "PR" : record?.status === "absent" ? "AB" : ""}
            </span>
            {record?.status === "present" ? (
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            ) : record?.status === "absent" ? (
              <X className="h-2.5 w-2.5" strokeWidth={3} />
            ) : null}
          </div>
          {record?.advance ? (
            <span
              className="absolute -top-1 -right-1 flex items-center gap-0.5 border px-1 text-[8px] font-bold shadow-sm"
              style={{ borderColor: "oklch(0.55 0.09 175)", background: "oklch(0.93 0.025 175)", color: "oklch(0.35 0.09 175)" }}
            >
              <Wallet className="h-2 w-2" strokeWidth={2.5} />
              {record.advance}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 pointer-events-auto border border-neutral-300 shadow-sm rounded-none font-mono" align="center">
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => pickStatus("present")}
              className={
                "border py-1 text-[9px] font-bold uppercase transition-colors " +
                (record?.status === "present" ? "text-white" : "bg-white hover:bg-neutral-50 border-neutral-300")
              }
              style={record?.status === "present" ? { background: "oklch(0.42 0.09 175)", borderColor: "oklch(0.42 0.09 175)" } : {}}
            >
              PRESENT
            </button>
            <button
              onClick={() => pickStatus("absent")}
              className={
                "border py-1 text-[9px] font-bold uppercase transition-colors " +
                (record?.status === "absent" ? "bg-rose-600 text-white border-rose-600" : "bg-white hover:bg-neutral-50 border-neutral-300 text-rose-950")
              }
            >
              ABSENT
            </button>
            <button
              onClick={() => pickStatus(null)}
              className="border border-neutral-300 py-1 text-[9px] font-bold uppercase bg-white hover:bg-neutral-50"
            >
              RESET
            </button>
          </div>
          <div className="space-y-1">
            <Label htmlFor={"adv-" + ymd(date)} className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
              ADVANCE (RS)
            </Label>
            <div className="flex gap-1">
              <Input
                id={"adv-" + ymd(date)}
                type="number"
                min={0}
                value={advance}
                className="border border-neutral-300 rounded-none focus-visible:ring-0 focus-visible:border-neutral-400 h-7 text-xs font-mono"
                onChange={(e) => setAdvance(Math.max(0, Number(e.target.value) || 0))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdvanceOnly();
                }}
              />
              <button
                onClick={saveAdvanceOnly}
                className="border border-neutral-950 bg-neutral-950 text-white px-2.5 text-[9px] font-bold uppercase hover:bg-neutral-800"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SettingsDialog({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [spreadsheetId, setSpreadsheetId] = useState(settings.spreadsheet_id ?? "");
  const [sheetName, setSheetName] = useState(settings.sheet_name ?? "Attendance");
  const [dailyRate, setDailyRate] = useState<number>(settings.daily_rate ?? DAILY_RATE_DEFAULT);
  const [saving, setSaving] = useState(false);
  const saveSettingsFn = useServerFn(updateSettings);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettingsFn({
        data: { spreadsheet_id: spreadsheetId || null, sheet_name: sheetName || "Attendance", daily_rate: dailyRate },
      });
      toast.success("Settings saved.");
      onSaved({ spreadsheet_id: spreadsheetId || null, sheet_name: sheetName || "Attendance", daily_rate: dailyRate });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="font-mono border border-neutral-300 rounded-none max-w-sm">
      <DialogHeader>
        <DialogTitle className="text-xs uppercase tracking-wider text-neutral-400">[SYSTEM_SETTINGS]</DialogTitle>
      </DialogHeader>
      <div className="space-y-3.5 my-2">
        <div className="space-y-1">
          <Label htmlFor="ss" className="text-[9px] uppercase tracking-wider">
            SPREADSHEET ID
          </Label>
          <Input
            id="ss"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8"
            placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUU..."
          />
          <p className="text-[8px] text-neutral-400">GOOGLE_SPREADSHEET_ID (FROM URL PATH)</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sn" className="text-[9px] uppercase tracking-wider">
            SHEET NAME (TAB)
          </Label>
          <Input
            id="sn"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8"
            placeholder="Attendance"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate" className="text-[9px] uppercase tracking-wider">
            DAILY RATE (RS)
          </Label>
          <Input
            id="rate"
            type="number"
            value={dailyRate}
            className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8"
            onChange={(e) => setDailyRate(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <DialogFooter className="sm:justify-start">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-neutral-950 text-white rounded-none hover:bg-neutral-800 text-xs font-mono py-1.5 h-8"
        >
          {saving ? "SAVING..." : "COMMIT CHANGES"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
