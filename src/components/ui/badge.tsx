import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "cyan" | "emerald" | "rose" | "red" | "amber";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    muted: "text-muted bg-white/5",
    cyan: "text-cyan bg-cyan-dim",
    emerald: "text-emerald bg-emerald-dim",
    rose: "text-rose bg-rose-dim",
    red: "text-red bg-red-dim",
    amber: "text-amber bg-amber-dim",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
