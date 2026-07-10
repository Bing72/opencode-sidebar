# opencode-sidebar

Local OpenCode TUI plugin based on `coin-seeker/opencode-timeline`, with an added Sessions tab beside the Timeline panel.

## Behavior

- The Timeline tab shows only real user queries from User Arguments; wrapper prompts, tool rows, and system reminders are hidden.
- The Sessions tab starts on the currently viewed session, keeps that session at the top, and marks busy sessions with the host theme info color.
- `Switch` opens a searchable session picker, `Filter` narrows the visible rows, and `◆` pins sessions ahead of other recent work. Pins persist under a plugin-namespaced key in OpenCode's TUI KV store.
- Session history is loaded only when a Timeline, timer, or visible Sessions row requests it, with at most four history requests running at once.
- Completion and error attention uses OpenCode's built-in notification service; enable `attention.enabled` in `tui.json` to receive it without duplicate plugin notifications.
- At `<= 120` terminal columns—the same breakpoint OpenCode uses for its automatic sidebar layout—the current session title appears centered in `app_bottom`; it is hidden again on wider layouts and uses a stable per-session color from the host theme palette.
- Click `×` on a non-current session row to delete it permanently. A final confirmation dialog is required before the plugin calls the OpenCode session delete API.
- Sessions/Timeline switching is mouse-driven through the tab labels; there is no Ctrl+Tab shortcut.

## Install

Paste below into your OpenCode agent.

```text
Install and configure opencode-sidebar by following the instructions here:
https://raw.githubusercontent.com/Bing72/opencode-sidebar/refs/heads/main/docs/installation.md
```

The agent will clone this repository into your OpenCode plugin directory, install dependencies, and register the TUI plugin in `~/.config/opencode/tui.json`.

## Development

```bash
bun install
bun run test
bun run typecheck
```

## Local TUI Registration

For local development, `~/.config/opencode/tui.json` should point to this checkout's TUI entry:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/home/bing72/.config/opencode/plugins/opencode-sidebar/src/tui.tsx"],
  "attention": { "enabled": true }
}
```
