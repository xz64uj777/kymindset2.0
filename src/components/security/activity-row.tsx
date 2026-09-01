import type { ButtonHTMLAttributes } from "react";
import { Ban, Check, Info, Pause, Play, Square, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PORTS } from "@/lib/security/catalog";
import type { ActivityStatus, SecurityActivity } from "@/lib/security/types";
import { useSecurity } from "@/lib/security/store";
import { cn, formatKb, timeAgo } from "@/lib/utils";

const STATUS_TONE: Record<ActivityStatus, "emerald" | "rose" | "red" | "amber" | "muted"> = {
  allowed: "emerald",
  suspicious: "rose",
  unknown: "amber",
  blocked: "red",
  killed: "red",
  resolved: "muted",
  paused: "amber",
};

export function ActionLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-subtle">
      <span>
        <span className="font-medium text-emerald">Allow</span> keep
      </span>
      <span>
        <span className="font-medium text-red">Block</span> cut host
      </span>
      <span>
        <span className="font-medium text-cyan">Details</span> options
      </span>
      <span>
        <span className="font-medium text-red">End</span> drop now
      </span>
      <span className="text-subtle">Tap a name to copy it</span>
    </div>
  );
}

export function ActivityRow({
  item,
  compact,
}: {
  item: SecurityActivity;
  compact?: boolean;
}) {
  const allow = useSecurity((s) => s.allow);
  const block = useSecurity((s) => s.block);
  const kill = useSecurity((s) => s.kill);
  const pause = useSecurity((s) => s.pause);
  const resume = useSecurity((s) => s.resume);
  const setPending = useSecurity((s) => s.setPending);
  const needsDecision = item.status === "suspicious" || item.status === "unknown";
  const dead = item.status === "blocked" || item.status === "killed";
  const port = item.destinationPort ?? item.sourcePort;
  const portMeta = port != null ? PORTS[port] : undefined;

  const endItem = (note: string, okMsg: string) => {
    const ok = kill(item.id, note);
    if (ok) toast.success(okMsg);
    else toast.error(`Tamper protection blocked ending ${item.name}`);
  };

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(item.name);
      toast.success("Copied full name");
    } catch {
      toast.message(item.name);
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-line bg-elevated/60 px-3 py-2.5",
        needsDecision && "border-rose/20 bg-rose-dim/30",
        (dead || item.status === "paused") && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            item.status === "allowed" && "bg-emerald",
            item.status === "suspicious" && "bg-rose",
            item.status === "unknown" && "bg-amber",
            item.status === "paused" && "bg-amber",
            (item.status === "blocked" || item.status === "killed") && "bg-red",
            item.status === "resolved" && "bg-subtle",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-1.5">
            <button
              type="button"
              onClick={copyName}
              title="Tap to copy full name"
              className="min-w-0 max-w-full break-all text-left text-sm font-medium leading-snug text-fg"
            >
              {item.name}
            </button>
            <Badge tone={STATUS_TONE[item.status]}>
              {item.resolveNote === "Network kill switch"
                ? "dropped"
                : item.status === "killed"
                  ? "ended"
                  : item.status}
            </Badge>
            {item.type === "traffic" && item.direction ? (
              <span className="text-2xs uppercase tracking-wide text-subtle">{item.direction}</span>
            ) : null}
          </div>
          {!compact ? (
            <p className="mt-0.5 break-words text-micro text-muted">
              {item.resolveNote && dead ? item.resolveNote : item.details}
              {portMeta ? ` · ${portMeta.name}` : null}
              {item.destination ? ` · ${item.destination}${port ? `:${port}` : ""}` : null}
              {item.source ? ` · from ${item.source}` : null}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-2xs text-subtle">
            {item.type === "traffic" && item.dataKb != null ? <span>{formatKb(item.dataKb)}</span> : null}
            {(item.type === "process" || item.type === "app") && item.cpu != null ? (
              <span>{item.cpu}% CPU</span>
            ) : null}
            {item.memoryMb != null ? <span>{item.memoryMb} MB</span> : null}
            <span>{timeAgo(item.createdAt)}</span>
          </div>
          {(item.type === "process" || item.type === "app") && item.cpu != null && !compact ? (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  item.status === "paused"
                    ? "bg-amber"
                    : item.cpu > 50
                      ? "bg-rose"
                      : item.cpu > 20
                        ? "bg-amber"
                        : "bg-emerald",
                )}
                style={{ width: `${Math.min(item.cpu, 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
      {!compact ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
          {needsDecision ? (
            <>
              <Chip title="Allow this host to keep talking" onClick={() => allow(item.id)} className="text-emerald border-emerald/25 bg-emerald-dim">
                <Check className="size-3" />
                Allow
              </Chip>
              <Chip title="Block this host" onClick={() => block(item.id)} className="text-red border-red/25 bg-red-dim">
                <Ban className="size-3" />
                Block
              </Chip>
              <Chip title="More options" onClick={() => setPending(item)} className="text-cyan border-cyan/25 bg-cyan-dim">
                <Info className="size-3" />
                Details
              </Chip>
            </>
          ) : null}
          {item.type === "traffic" && !needsDecision ? (
            <>
              {dead ? (
                <Chip
                  title="Allow this host for future requests"
                  onClick={() => {
                    allow(item.id);
                    toast.success(`Allowed ${item.name} for future requests`);
                  }}
                  className="text-emerald border-emerald/25 bg-emerald-dim"
                >
                  <Check className="size-3" />
                  Allow
                </Chip>
              ) : (
                <Chip
                  title="Block this host"
                  onClick={() => {
                    block(item.id);
                    toast.success(`Blocked ${item.name}`);
                  }}
                  className="text-red border-red/25 bg-red-dim"
                >
                  <Ban className="size-3" />
                  Block
                </Chip>
              )}
              <Chip title="More options" onClick={() => setPending(item)} className="text-cyan border-cyan/25 bg-cyan-dim">
                <Info className="size-3" />
                Details
              </Chip>
            </>
          ) : null}
          {item.type === "process" && item.status === "paused" ? (
            <Chip
              title="Resume process"
              onClick={() => {
                resume(item.id);
                toast.success(`Resumed ${item.name}`);
              }}
              className="text-emerald border-emerald/25 bg-emerald-dim"
            >
              <Play className="size-3" />
              Resume
            </Chip>
          ) : null}
          {item.type === "process" && !dead && item.status !== "paused" ? (
            <Chip
              title="Pause process"
              onClick={() => {
                const ok = pause(item.id);
                if (ok) toast.success(`Paused ${item.name}`);
                else toast.error(`Tamper protection blocked pausing ${item.name}`);
              }}
              className="text-amber border-amber/25 bg-amber-dim"
            >
              <Pause className="size-3" />
              Pause
            </Chip>
          ) : null}
          {(item.type === "process" || item.type === "app") && !dead ? (
            <Chip
              title={item.type === "app" ? "Stop app" : "Stop process"}
              onClick={() =>
                endItem(
                  item.type === "app" ? "App stopped by user" : "Process stopped by user",
                  `Stopped ${item.name}`,
                )
              }
              className="text-red border-red/25 bg-red-dim"
            >
              <Square className="size-3" />
              Stop
            </Chip>
          ) : null}
          {item.type === "traffic" && !dead ? (
            <Chip
              title="End this connection"
              onClick={() => endItem("Connection reset by user", `Ended ${item.name}`)}
              className="text-red border-red/25 bg-red-dim"
            >
              <XCircle className="size-3" />
              End
            </Chip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  children,
  className,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
