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
import { DayCell } from "./day-cell";

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

  useEffect(() => {
    if (!settings.spreadsheet_id) return;
    handleSync(true);
    const interval = setInterval(() => {
      handleSync(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [settings.spreadsheet_id, settings.sheet_name]);

  const saveDay = async (date: Date, status: AttendanceStatus | null, advance: number, notes: string = ""): Promise<void> => {
    if (isSunday(date)) return;
    const key = ymd(date);
    const notesTrim = (notes ?? "").trim();
    if (status === null && advance === 0 && !notesTrim) {
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
        data: { date: key, status: effectiveStatus, amount, advance, notes: notesTrim },
      });
      setRecords({ ...records, [key]: data as AttendanceRecord });
      handleSync(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save day");
    }
  };

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

  const handlePush = async () => {
    if (!requireSheet()) return;
    setSyncing(true);
    try {
      const rows: Array<Array<string | number>> = [["Date", "Day", "Status", "Amount (Rs)", "Advance (Rs)", "Net (Rs)", "Notes"]];
      days.forEach((d) => {
        if (isSunday(d)) return;
        const key = ymd(d);
        const r = records[key];
        const amount = r?.amount ?? 0;
        const adv = r?.advance ?? 0;
        rows.push([key, DAY_NAMES_FULL[d.getDay()], r?.status ?? "", amount, adv, amount - adv, r?.notes ?? ""]);
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

  const handlePull = async () => {
    if (!requireSheet()) return;
    setPulling(true);
    try {
      const res = await pullSheet({ data: { spreadsheetId: settings.spreadsheet_id!, tabName } });
      if (!res.found) {
        toast.error(`No tab "${tabName}" in the spreadsheet yet. Push first.`);
        return;
      }
      const upserts: Array<{ date: string; status: "present" | "absent"; amount: number; advance: number; notes?: string }> = [];
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
        const notes = (row[6] ?? "").toString().trim();
        upserts.push({
          date,
          status: effective,
          amount: effective === "present" ? settings.daily_rate : 0,
          advance,
          notes,
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

  const firstDow = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const cells: Array<Date | null> = [...Array(firstDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const monthParam = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-[#fcfcfc] p-2 sm:p-4 md:p-6 lg:p-8 font-mono text-neutral-900 selection:bg-neutral-950 selection:text-white overflow-x-hidden">
      <Toaster richColors position="top-center" />
      <div className="mx-auto w-full max-w-6xl border border-neutral-300 bg-white shadow-sm flex flex-col md:flex-row overflow-hidden relative">
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-neutral-400"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-neutral-400"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-neutral-400"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-neutral-400"></div>

        <aside className="w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 bg-neutral-50 p-4 sm:p-6 flex flex-col justify-between gap-6 sm:gap-8">
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
              <button onClick={goPrev} className="flex-1 border border-neutral-700 py-1 text-xs font-bold hover:bg-neutral-700 transition-colors" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4 mx-auto" />
              </button>
              <button onClick={goToday} className="flex-1 border border-neutral-700 py-1 text-[9px] font-bold uppercase hover:bg-neutral-700 transition-colors">
                TODAY
              </button>
              <button onClick={goNext} className="flex-1 border border-neutral-700 py-1 text-xs font-bold hover:bg-neutral-700 transition-colors" aria-label="Next month">
                <ChevronRight className="h-4 w-4 mx-auto" />
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-neutral-200">
            <StatBlock label="WORKING_DAYS" value={stats.workingDays} />
            <StatBlock label="STATUS_PRESENT" value={stats.present} />
            <StatBlock label="STATUS_ABSENT" value={stats.absent} />
            <StatBlock label="EST_EARNINGS" value={formatCurrency(stats.earnings)} />
          </div>
          <div className="flex flex-col lg:flex-row flex-1 min-w-0">
            <div className="flex-1 p-3 sm:p-4 md:p-6 min-w-0 overflow-x-auto">
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1 min-w-[280px]">
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
              <div className="mt-6 flex flex-wrap items-center gap-4 text-[9px] uppercase tracking-wider text-neutral-500">
                <LegendDot style={{ background: "oklch(0.42 0.09 175)" }} label="Present" />
                <LegendDot className="border border-rose-400 bg-rose-50 text-rose-700" label="Absent" />
                <LegendDot className="bg-neutral-100" label="Sunday (Off)" />
                <span className="ml-auto text-neutral-400 font-light">[TAP DAY CELL TO CONFIGURE]</span>
              </div>
            </div>
            <div className="w-full lg:w-72 shrink-0 border-t-4 lg:border-t-0 lg:border-l-4 border-black bg-black text-white p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
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
                  <p className="text-[9px] uppercase text-neutral-400">Present</p>
                  <p className="text-lg font-bold">{stats.present}</p>
                </div>
                <div className="border-2 border-white/25 py-2">
                  <p className="text-[9px] uppercase text-neutral-400">Absent</p>
                  <p className="text-lg font-bold">{stats.absent}</p>
                </div>
              </div>
              <div className="border-2 border-white/25 p-3">
                <p className="text-[9px] uppercase text-neutral-400">Net Salary</p>
                <p className="text-2xl font-black tracking-tight">{formatCurrency(stats.net)}</p>
                <p className="text-[9px] text-neutral-500 mt-1">
                  Earn {formatCurrency(stats.earnings)} − Adv {formatCurrency(stats.advances)}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 sm:p-5 border-r border-neutral-200 last:border-r-0 bg-white min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">{`[${label}]`}</div>
      <div className="text-base sm:text-xl font-bold mt-1 tabular-nums text-neutral-900 truncate">{value}</div>
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

function SettingsDialog({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [spreadsheetId, setSpreadsheetId] = useState(settings.spreadsheet_id ?? "");
  const [sheetName, setSheetName] = useState(settings.sheet_name ?? "Attendance");
  const [dailyRate, setDailyRate] = useState(settings.daily_rate);
  const [saving, setSaving] = useState(false);
  const saveSettings = useServerFn(updateSettings);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        data: {
          spreadsheet_id: spreadsheetId || null,
          sheet_name: sheetName || "Attendance",
          daily_rate: dailyRate,
        },
      });
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
          <Label htmlFor="ss" className="text-[9px] uppercase tracking-wider">SPREADSHEET ID</Label>
          <Input id="ss" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8" placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUU..." />
          <p className="text-[8px] text-neutral-400">GOOGLE_SPREADSHEET_ID (FROM URL PATH)</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sn" className="text-[9px] uppercase tracking-wider">SHEET NAME (TAB)</Label>
          <Input id="sn" value={sheetName} onChange={(e) => setSheetName(e.target.value)} className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8" placeholder="Attendance" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate" className="text-[9px] uppercase tracking-wider">DAILY RATE (RS)</Label>
          <Input id="rate" type="number" value={dailyRate} className="border border-neutral-300 rounded-none text-xs focus-visible:ring-0 focus-visible:border-neutral-400 h-8" onChange={(e) => setDailyRate(Number(e.target.value) || 0)} />
        </div>
      </div>
      <DialogFooter className="sm:justify-start">
        <Button onClick={save} disabled={saving} className="bg-neutral-950 text-white rounded-none hover:bg-neutral-800 text-xs font-mono py-1.5 h-8">
          {saving ? "SAVING..." : "COMMIT CHANGES"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function BrutalButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 border-2 border-neutral-950 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-950 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function WireframeButton({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-full items-center justify-center gap-1.5 border border-neutral-400 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:border-neutral-950 hover:bg-neutral-50 cursor-pointer transition-colors">
      {children}
    </span>
  );
}
