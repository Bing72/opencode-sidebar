# Design System

## 1. Product Feel

This is a terminal-native observability panel for opencode sessions. It should feel compact, factual, and calm: status at a glance, no decorative chrome, no visual noise.

## 2. Color Tokens

- `accent`: host theme accent or primary; used for active tabs and live/running rows.
- `muted`: host theme textMuted; used for clocks, durations, inactive tabs, and idle rows.
- `success`: host theme success; used for completed work.
- `warning`: host theme warning; used for retry/rate-limited states and todo rows.
- `error`: host theme error; used for failed rows.
- `text`: host theme text; used for primary labels.

## 3. Typography

- Headers use bold terminal text.
- Primary row labels use normal terminal text, except active timeline requests which use bold.
- Secondary metadata uses muted terminal text.

## 4. Spacing

- Panels stack vertically with one blank terminal row between major sections.
- Rows are single-line unless a session row includes a secondary directory/model line.
- Tab labels render on one row: active label bracketed, inactive label plain.

## 5. Components

- `AgentsPanel`: latest visible sub-agent batch, always shows a header and empty state.
- `TimelinePanel`: request/todo/sub-agent high-level history, click opens detail dialog.
- `SessionTabs`: `Timeline` and `Sessions`, click switches active panel.
- `SessionsPanel`: recent opencode sessions with status glyph, title, updated age, and click navigation.

## 6. Interaction

- Mouse click is the primary interaction for tabs, timeline details, agent rows, and session navigation.
- Keyboard shortcuts are avoided unless the opencode keymap binding is known not to conflict with prompt editing.

## 7. Non-Goals

- No web-style animations, gradients, icons, or decorative emoji.
- No destructive session actions from this plugin.
