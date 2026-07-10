# Design System

## 1. Product Feel

This is a terminal-native observability panel for opencode sessions. It should feel compact, factual, and calm: status at a glance, no decorative chrome, no visual noise.

## 2. Color Tokens

- `accent`: host theme accent or primary; used for active tabs and live agent rows.
- `info`: host theme info; used for busy session status text and session glyphs.
- `sessionTitlePalette`: stable per-session rotation through host `accent`, `primary`, `success`, `info`, `warning`, and `secondary`; used only for the narrow-width bottom session title.
- `muted`: host theme textMuted; used for clocks, durations, inactive tabs, and idle rows.
- `success`: host theme success; used for completed work.
- `warning`: host theme warning; used for retry/rate-limited states and todo rows.
- `error`: host theme error; used for failed rows and the non-current session delete request.
- `text`: host theme text; used for primary labels.

## 3. Typography

- Headers use bold terminal text.
- Primary row labels use normal terminal text, except active timeline requests which use bold.
- Secondary metadata uses muted terminal text.

## 4. Spacing

- Panels stack vertically with one blank terminal row between major sections.
- Rows are single-line unless a session row includes a secondary status/model line.
- Tab labels render on one row: active label bracketed, inactive label plain.

## 5. Components

- `AgentsPanel`: latest visible sub-agent batch, always shows a header and empty state.
- `TimelinePanel`: user query timeline built from real User Arguments, click opens detail dialog.
- `SessionTabs`: `Timeline` and `Sessions`, click switches active panel.
- `SessionsPanel`: recent opencode sessions with status glyph, title, updated age, click navigation, persistent plugin-local `◆` pins, submitted text filtering, a searchable quick-switch dialog, and theme-error `×` delete request on non-current rows.
- `BottomSessionTitle`: current session title in `app_bottom` at `<= 120` columns, matching the host's automatic sidebar breakpoint; centered, prefix-free, and hidden on wider layouts.

## 6. Interaction

- Mouse click is the primary interaction for tabs, timeline details, agent rows, and session navigation.
- `Switch` opens the host `DialogSelect` for searchable mouse/keyboard selection without registering a plugin keymap. `Filter` opens `DialogPrompt`; clearing the filter restores all capped rows.
- Pin actions stop row-event propagation and persist through a plugin-namespaced key in OpenCode's shared TUI KV store. The current session remains first, followed by pinned sessions and then recent unpinned sessions.
- Session completion/error attention is owned by OpenCode's built-in `internal:notifications` plugin. Installation enables the host attention config instead of registering duplicate event listeners.
- History demand is lazy at panel boundaries and globally limited to four concurrent SDK requests. Retry, invalidation, deletion, and disposal all pass through the same queue.
- Session row `×` requests permanent deletion only on non-current sessions. It opens a final confirmation dialog; cancel clears the dialog without deleting, and confirm is the only path that calls the destructive session delete API.
- Keyboard shortcuts are avoided unless the opencode keymap binding is known not to conflict with prompt editing.

## 7. Non-Goals

- No web-style animations, gradients, icons, or decorative emoji.
- No destructive session actions without a final confirmation step.
