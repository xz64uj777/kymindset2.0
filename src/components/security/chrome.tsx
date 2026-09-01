import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-5", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  icon,
  title,
  subtitle,
  iconClass,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  iconClass?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-sm bg-cyan-dim text-cyan",
          iconClass,
        )}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {subtitle ? <p className="text-xs text-subtle">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function StatusDot({
  tone,
  className,
}: {
  tone: "emerald" | "cyan" | "rose" | "red" | "amber" | "teal" | "muted";
  className?: string;
}) {
  const map: Record<string, string> = {
    emerald: "bg-emerald",
    cyan: "bg-cyan",
    rose: "bg-rose",
    red: "bg-red",
    amber: "bg-amber",
    teal: "bg-teal",
    muted: "bg-subtle",
  };
  return <span className={cn("size-2 rounded-full", map[tone], className)} />;
}

export function ScoreTone(status: string) {
  if (status === "excellent")
    return { color: "text-emerald", bg: "bg-emerald-dim", bar: "bg-emerald" };
  if (status === "fair") return { color: "text-cyan", bg: "bg-cyan-dim", bar: "bg-cyan" };
  if (status === "at_risk")
    return { color: "text-amber", bg: "bg-amber-dim", bar: "bg-amber" };
  return { color: "text-red", bg: "bg-red-dim", bar: "bg-red" };
}

export function BgField() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-bg" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute -left-24 top-[-10%] size-[420px] rounded-full bg-cyan/5 blur-3xl" />
      <div className="absolute -right-16 bottom-[-10%] size-[380px] rounded-full bg-emerald/5 blur-3xl" />
      <div className="scan-line absolute inset-x-0 h-24 bg-linear-to-b from-transparent via-cyan/5 to-transparent" />
    </div>
  );
}
