# opencode-session-timeline

Local OpenCode TUI plugin based on `coin-seeker/opencode-timeline`, with an added Sessions tab beside the Timeline panel.

## Install

Paste below into your OpenCode agent.

```text
Install and configure opencode-session-timeline by following the instructions here:
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
  "plugin": [
    "oh-my-openagent@latest",
    ["/home/bing72/opencode-plugin/src/tui.tsx", { "enabled": true }]
  ]
}
```
