import { AppUpdatePanel } from "./app-update";
import { ConfigPanel } from "./config-panel";
import { DeviceOwnerPanel } from "./device-owner";
import { KillAllowPanel } from "./kill-allow";

export function ConfigScreen() {
  return (
    <div className="space-y-4">
      <AppUpdatePanel />
      <DeviceOwnerPanel />
      <KillAllowPanel />
      <ConfigPanel />
    </div>
  );
}
