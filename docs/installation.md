# opencode-session-timeline installation

These instructions are for an OpenCode agent. Install the plugin from GitHub, then register its local TUI entry.

## Agent task

Install and configure `opencode-session-timeline` for the current user.

1. Clone or update the repository at `~/.config/opencode/plugins/opencode-session-timeline`.
2. Run `bun install` inside that plugin directory.
3. Update `~/.config/opencode/tui.json` so the `plugin` array contains this entry, using the user's absolute home path:

```json
["/home/<user>/.config/opencode/plugins/opencode-session-timeline/src/tui.tsx", { "enabled": true }]
```

Keep any existing plugin entries. Do not duplicate the entry if it is already present.

## Commands

```bash
PLUGIN_DIR="$HOME/.config/opencode/plugins/opencode-session-timeline"
mkdir -p "$(dirname "$PLUGIN_DIR")"

if [ -d "$PLUGIN_DIR/.git" ]; then
  git -C "$PLUGIN_DIR" pull --ff-only
else
  git clone https://github.com/Bing72/opencode-sidebar.git "$PLUGIN_DIR"
fi

bun --cwd "$PLUGIN_DIR" install
```

After editing `~/.config/opencode/tui.json`, restart OpenCode. The TUI config is not hot-reloaded.

## Expected `tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["/home/<user>/.config/opencode/plugins/opencode-session-timeline/src/tui.tsx", { "enabled": true }]
  ]
}
```
