import { useState } from "react";
import { EyeOff, History, MemoryStick, Shield, ShieldCheck } from "lucide-react";
import type { IntelSection } from "@/lib/security/types";
import { cn } from "@/lib/utils";
import { HistoryPanel, HoneypotPanel, PosturePanel, SystemPanel, TimelinePanel } from "./panels";

const SECTIONS: { id: IntelSection; label: string; icon: typeof Shield }[] = [
  { id: "runtime", label: "Runtime", icon: MemoryStick },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "posture", label: "Posture", icon: ShieldCheck },
  { id: "history", label: "History", icon: Shield },
  { id: "honeypot", label: "Honeypot", icon: EyeOff },
];

export function IntelPanel({ initial }: { initial?: IntelSection } = {}) {
  const [section, setSection] = useState<IntelSection>(initial ?? "runtime");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                active ? "bg-cyan-dim text-cyan ring-1 ring-cyan/40" : "text-muted hover:bg-white/5 hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>
      {section === "runtime" && <SystemPanel />}
      {section === "timeline" && <TimelinePanel />}
      {section === "posture" && <PosturePanel />}
      {section === "history" && <HistoryPanel />}
      {section === "honeypot" && <HoneypotPanel />}
    </div>
  );
}
