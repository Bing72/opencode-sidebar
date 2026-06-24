# opencode-session-timeline

Local OpenCode TUI plugin based on `coin-seeker/opencode-timeline`, with an added Sessions tab beside the Timeline panel.

## Development

```bash
bun install
bun run test
bun run typecheck
```

## Local TUI Registration

`~/.config/opencode/tui.json` should point to the local TUI entry:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "oh-my-openagent@latest",
    ["/home/bing72/opencode-plugin/src/tui.tsx", { "enabled": true }]
  ]
}
```
