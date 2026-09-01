import { Delete, Fingerprint } from "lucide-react";
import { useState } from "react";
import { vibrate } from "@/lib/native";
import { cn } from "@/lib/utils";

export function PinPad({
  length = 4,
  onSubmit,
  onBio,
  error,
  shake,
  compact,
}: {
  length?: number;
  onSubmit: (pin: string) => void;
  onBio?: () => Promise<boolean>;
  error?: string;
  shake?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [bioBusy, setBioBusy] = useState(false);

  const press = (key: string) => {
    if (key === "del") {
      vibrate(8);
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (key === "bio") {
      setBioBusy(true);
      void (async () => {
        const ok = onBio ? await onBio() : true;
        setBioBusy(false);
        if (ok) onSubmit("__bio__");
      })();
      return;
    }
    if (value.length >= length) return;
    vibrate(10);
    const next = value + key;
    setValue(next);
    if (next.length === length) {
      window.setTimeout(() => {
        onSubmit(next);
        setValue("");
      }, 140);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];

  return (
    <div className="flex flex-col items-center gap-5">
      <div className={cn("flex gap-3", shake && "pin-shake")}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3 rounded-full bg-cyan transition-[transform,opacity] duration-150",
              value.length > i ? "scale-100 opacity-100" : "scale-[0.35] opacity-20",
            )}
          />
        ))}
      </div>
      {error ? <p className="text-sm font-medium text-red">{error}</p> : null}
      {bioBusy ? <p className="text-micro text-cyan">Verifying…</p> : null}
      <div className={cn("grid grid-cols-3", compact ? "gap-2.5" : "gap-3")}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === "bio" ? "Unlock with biometrics" : k === "del" ? "Delete" : k}
            onClick={() => press(k)}
            disabled={bioBusy}
            className={cn(
              "flex items-center justify-center rounded-full border border-line bg-elevated font-light text-fg/90 transition-transform duration-150 ease-out hover:bg-white/10 active:scale-95 disabled:opacity-50",
              compact ? "size-14 text-lg" : "size-16 text-xl",
            )}
          >
            {k === "del" ? (
              <Delete className="size-5" />
            ) : k === "bio" ? (
              <Fingerprint className="size-5 text-cyan" />
            ) : (
              k
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
