import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import {
  nextSidebarTab,
  SIDEBAR_TOGGLE_BINDING,
  SIDEBAR_TOGGLE_COMMAND,
  SIDEBAR_TOGGLE_DESCRIPTION,
  SIDEBAR_TOGGLE_TITLE,
} from "./tabs";
import type { SidebarTab } from "./types";

type KeymapApi = Pick<TuiPluginApi, "keymap">;

export function registerSidebarTabKeymap(
  api: KeymapApi,
  activeTab: () => SidebarTab,
  selectTab: (tab: SidebarTab) => void,
): void {
  api.keymap.registerLayer({
    mode: "base",
    commands: [
      {
        name: SIDEBAR_TOGGLE_COMMAND,
        title: SIDEBAR_TOGGLE_TITLE,
        category: "Sessions",
        run() {
          selectTab(nextSidebarTab(activeTab()));
        },
      },
    ],
    bindings: [{ key: SIDEBAR_TOGGLE_BINDING, cmd: SIDEBAR_TOGGLE_COMMAND, desc: SIDEBAR_TOGGLE_DESCRIPTION }],
  });
}
