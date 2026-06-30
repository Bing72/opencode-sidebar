# opencode-session-timeline installation

These instructions are for an OpenCode agent. Install the plugin from GitHub, then register its local TUI entry.

On Windows PowerShell, prefer the PowerShell commands below. Do not run the Bash block through PowerShell, and do not require `bun install` if Bun or OpenCode's bundled Bun runtime is crashing.

## Runtime behavior

- Timeline rows show only real user queries from User Arguments.
- Sessions is the default tab. It keeps the currently viewed session at the top and uses the host theme info color for busy sessions.
- On narrow terminals where OpenCode hides the sidebar (`<= 120` columns), the current session title is shown centered in `app_bottom` without a prefix. Wider terminals hide this bottom title and rely on the sidebar title.
- The bottom session title uses a stable per-session rotation through the host theme palette, so the color stays fixed for the same session instead of flickering per render.
- Use the mouse to switch Sessions/Timeline tabs. The plugin does not register a Ctrl+Tab shortcut.
- On non-current session rows, `×` opens a final confirmation dialog before permanent deletion.

## Agent task

Install and configure `opencode-session-timeline` for the current user.

1. Clone or update the repository at `~/.config/opencode/plugins/opencode-session-timeline`.
2. Install dependencies in that plugin directory. Use `npm install --prefix <plugin-dir>` on Windows PowerShell; `bun install` is optional on platforms where Bun is stable.
3. Update `~/.config/opencode/tui.json` so the `plugin` array contains this entry, using the user's absolute home path:

```json
["/home/<user>/.config/opencode/plugins/opencode-session-timeline/src/tui.tsx", { "enabled": true }]
```

Keep any existing plugin entries. Do not duplicate the entry if it is already present.

## macOS / Linux commands

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

If Bun crashes, use npm instead:

```bash
npm install --prefix "$PLUGIN_DIR"
```

## Windows PowerShell commands

```powershell
$PluginDir = Join-Path $HOME '.config\opencode\plugins\opencode-session-timeline'
$PluginParent = Split-Path -Parent $PluginDir
New-Item -ItemType Directory -Force -Path $PluginParent | Out-Null

if (Test-Path (Join-Path $PluginDir '.git')) {
  git -C $PluginDir pull --ff-only
} else {
  git clone https://github.com/Bing72/opencode-sidebar.git $PluginDir
}

npm install --prefix $PluginDir
```

For `tui.json` on Windows, use an absolute path with forward slashes or escaped backslashes. Forward slashes are easiest:

```json
["C:/Users/<user>/.config/opencode/plugins/opencode-session-timeline/src/tui.tsx", { "enabled": true }]
```

If OpenCode shows a Bun segmentation fault while installing or loading plugins, stop retrying the same `bunx` or `bun install` command in that session. Finish the clone and dependency install with PowerShell + npm, update `tui.json`, then restart OpenCode. The plugin is local TypeScript/TSX plus npm dependencies; it does not require Bun for dependency installation.

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

Keep `oh-my-openagent@latest` or any other existing TUI plugin entries in the array when they are already present.
