import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isSunday,
  ymd,
  type AttendanceRecord,
  type AttendanceStatus,
} from "@/lib/attendance";

export function DayCell({
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
  onSave: (date: Date, status: AttendanceStatus | null, advance: number, notes?: string) => Promise<void>;
}) {
  const sunday = isSunday(date);
  const [open, setOpen] = useState(false);
  const [advance, setAdvance] = useState<number>(record?.advance ?? 0);
  const [notes, setNotes] = useState<string>(record?.notes ?? "");

  useEffect(() => {
    setAdvance(record?.advance ?? 0);
    setNotes(record?.notes ?? "");
  }, [record?.advance, record?.notes]);

  const pickStatus = async (status: AttendanceStatus | null) => {
    await onSave(date, status, advance, notes);
    setOpen(false);
  };

  const saveAdvanceOnly = async () => {
    await onSave(date, record?.status ?? null, advance, notes);
    setOpen(false);
  };

  const presentStyle = record?.status === "present" ? { background: "oklch(0.42 0.09 175)", color: "white" } : {};
  const todayRingClass = isToday && !sunday ? "ring-1 ring-offset-1" : "";
  const todayRingStyle = isToday && !sunday ? { ringColor: "oklch(0.55 0.09 175)", outline: "1.5px solid oklch(0.55 0.09 175)", outlineOffset: "2px" } : {};

  const cellClass = [
    "relative flex aspect-square flex-col items-start justify-between p-1 sm:p-2 text-xs border transition-all",
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
          <span className="text-[10px] sm:text-[11px] leading-none">{date.getDate()}</span>
          {record?.notes ? (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" title="Has note" />
          ) : null}
          <div className="flex w-full items-end justify-between">
            <span className="text-[6px] sm:text-[7px] uppercase tracking-wider opacity-65">
              {record?.status === "present" ? "PR" : record?.status === "absent" ? "AB" : ""}
            </span>
            {record?.status === "present" ? (
              <Check className="h-2.5 w-2.5" />
            ) : record?.status === "absent" ? (
              <span className="text-[8px]">×</span>
            ) : null}
          </div>
          {record?.advance ? (
            <span className="absolute bottom-0.5 right-0.5 text-[6px] opacity-70">A</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(18rem,calc(100vw-1.5rem))] pointer-events-auto border border-neutral-300 shadow-sm rounded-none font-mono" align="center">
        <div className="space-y-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
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
          <div className="space-y-1">
            <Label htmlFor={"note-" + ymd(date)} className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
              NOTES
            </Label>
            <textarea
              id={"note-" + ymd(date)}
              value={notes}
              rows={2}
              placeholder="Optional note…"
              className="w-full border border-neutral-300 rounded-none focus:outline-none focus:border-neutral-400 text-[11px] font-mono p-1.5 resize-y min-h-[2.5rem] bg-white"
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveAdvanceOnly();
              }}
            />
            <button
              onClick={saveAdvanceOnly}
              className="w-full border border-neutral-950 bg-neutral-950 text-white py-1.5 text-[9px] font-bold uppercase hover:bg-neutral-800"
            >
              SAVE NOTE & ADVANCE
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
