/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui";
import { createSignal, type JSX } from "solid-js";

import { resolveChildIdFrom } from "./agents";
import { createCoalescer } from "./coalesce";
import { capEnvelopes, capSessions, type Envelope, mergeEnvelopes, sanitizeEnvelope } from "./history";
import { createSessionActions } from "./session-actions";
import { createGlobalSessionRefreshClient, createSessionRefresher } from "./session-refresh";
import { type ImmediateSessionEvent, sessionStatusesAfterEvent } from "./session-status-events";
import { currentSessionProjectPath } from "./sessions";
import { DEFAULT_SIDEBAR_TAB, SIDEBAR_CONTENT_ORDER, shouldRefreshSessionsOnTabSelect } from "./tabs";
import {
  canFetchChildren,
  type LiveTailUpdate,
  liveTailFlushPlan,
  markChildrenFetch,
  SESSION_REFRESH_EVENTS,
} from "./tui-state";
import type { Part, PluginOptions, Session, SessionStatus, SidebarTab } from "./types";
import {
  type PanelDeps,
  renderAgentsPanel,
  renderPromptTimer,
  renderSessionsPanel,
  renderTimelinePanel,
} from "./ui-panels";
import { renderTabs } from "./ui-rows";

interface SlotProps {
  readonly session_id: string;
}

type ToolPart = Extract<Part, { type: "tool" }>;

const HISTORY_FETCH_LIMIT = 150;
const MAX_HISTORY_MESSAGES = 600;
const MAX_HISTORY_SESSIONS = 32;
const TICK_MS = 60_000;
const DATA_THROTTLE_MS = 500;

function strField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = (rawOptions as PluginOptions | undefined) ?? {};
  const [now, setNow] = createSignal(Date.now());
  const [dataRev, setDataRev] = createSignal(0);
  const [activeTab, setActiveTab] = createSignal<SidebarTab>(DEFAULT_SIDEBAR_TAB);
  const [history, setHistory] = createSignal<ReadonlyMap<string, ReadonlyArray<Envelope>>>(new Map());
  const [sessions, setSessions] = createSignal<ReadonlyArray<Session>>([]);
  const [sessionStatuses, setSessionStatuses] = createSignal<ReadonlyMap<string, SessionStatus>>(new Map());
  const [sessionError, setSessionError] = createSignal<string | undefined>();
  const inFlight = new Set<string>();
  const failed = new Set<string>();
  let disposed = false;

  const liveEnvelopes = (sid: string): Envelope[] =>
    api.state.session.messages(sid).map((info) => ({ info, parts: api.state.part(info.id) }));
  const boundedHistory = (merged: Envelope[]): Envelope[] =>
    capEnvelopes(merged.map(sanitizeEnvelope), MAX_HISTORY_MESSAGES);
  const partsByMsg = (merged: ReadonlyArray<Envelope>): Map<string, ReadonlyArray<Part>> =>
    new Map(merged.map((entry) => [entry.info.id, entry.parts] as const));
  const flattenParts = (merged: ReadonlyArray<Envelope>): Part[] => merged.flatMap((entry) => [...entry.parts]);

  const absorbLiveTail = (sid: string): void => {
    setHistory((prev) => {
      const cached = prev.get(sid);
      if (cached === undefined) return prev;
      return new Map(prev).set(sid, boundedHistory(mergeEnvelopes(cached, liveEnvelopes(sid))));
    });
  };

  const ensureHistory = (sid: string): void => {
    if (disposed || inFlight.has(sid) || failed.has(sid) || history().has(sid)) return;
    inFlight.add(sid);
    api.client.session
      .messages({ sessionID: sid, limit: HISTORY_FETCH_LIMIT })
      .then((res) => {
        if (disposed) return;
        const data = res.data;
        if (!data) {
          failed.add(sid);
          return;
        }
        const full: Envelope[] = data.map((item) => ({ info: item.info, parts: item.parts }));
        setHistory((prev) =>
          capSessions(
            new Map(prev).set(sid, boundedHistory(mergeEnvelopes(full, liveEnvelopes(sid)))),
            MAX_HISTORY_SESSIONS,
          ),
        );
        setDataRev((value) => value + 1);
      })
      .catch((error: unknown) => {
        failed.add(sid);
        setSessionError(error instanceof Error ? error.message : "Failed to load session history");
      })
      .finally(() => inFlight.delete(sid));
  };

  const refreshSessions = createSessionRefresher(createGlobalSessionRefreshClient(api.client.session), {
    isDisposed: () => disposed,
    now: Date.now,
    setError: setSessionError,
    setSessions,
    setStatuses: setSessionStatuses,
  });

  const [children, setChildren] = createSignal<ReadonlyMap<string, ReadonlyArray<Session>>>(new Map());
  const [childrenVersion, setChildrenVersion] = createSignal(0);
  const childrenInFlight = new Set<string>();
  const childrenRetryAt = new Map<string, number>();

  const ensureChildren = (sid: string): void => {
    const fetchNow = Date.now();
    if (disposed || childrenInFlight.has(sid) || !canFetchChildren(sid, childrenRetryAt, fetchNow)) return;
    markChildrenFetch(childrenRetryAt, sid, fetchNow);
    childrenInFlight.add(sid);
    api.client.session
      .children({ sessionID: sid })
      .then((res) => {
        if (disposed || !res.data) return;
        setChildren((prev) => new Map(prev).set(sid, res.data));
        setChildrenVersion((value) => value + 1);
      })
      .catch((error: unknown) => {
        setSessionError(error instanceof Error ? error.message : "Failed to load child sessions");
      })
      .finally(() => childrenInFlight.delete(sid));
  };

  const makeResolveChildId =
    (sid: string) =>
    (part: ToolPart): string | undefined => {
      const kids = children().get(sid);
      const desc = strField(part.state.input.description);
      if (kids === undefined || desc === undefined) return undefined;
      return resolveChildIdFrom(kids, desc, "time" in part.state ? part.state.time.start : 0);
    };

  let mergedKey = "";
  let mergedCache: Envelope[] = [];
  const mergedFor = (sid: string): Envelope[] => {
    const key = `${sid}:${dataRev()}:${history().has(sid) ? "h" : "l"}`;
    if (key === mergedKey) return mergedCache;
    mergedCache = mergeEnvelopes(history().get(sid) ?? [], liveEnvelopes(sid));
    mergedKey = key;
    return mergedCache;
  };

  const dataCoalescer = createCoalescer<LiveTailUpdate>(DATA_THROTTLE_MS, (updates) => {
    const plan = liveTailFlushPlan(updates, history().keys());
    for (const sid of plan.sessionIds) absorbLiveTail(sid);
    if (plan.refreshSessions) refreshSessions(true);
    setDataRev((value) => value + 1);
  });
  const onData = (event?: { readonly properties?: { readonly sessionID?: string } }): void =>
    dataCoalescer.schedule({ sessionID: event?.properties?.sessionID, refreshSessions: true });
  const onPartData = (event?: { readonly properties?: { readonly sessionID?: string } }): void =>
    dataCoalescer.schedule({ sessionID: event?.properties?.sessionID, refreshSessions: false });
  const onSessionStatus = (event: ImmediateSessionEvent): void => {
    setSessionStatuses((prev) => sessionStatusesAfterEvent(prev, event));
    setDataRev((value) => value + 1);
    onData(event);
  };
  const selectTab = (tab: SidebarTab): void => {
    setActiveTab(tab);
    if (shouldRefreshSessionsOnTabSelect(tab)) refreshSessions(true);
  };
  const sessionActions = createSessionActions({
    api,
    signals: { sessions, setSessions, setSessionStatuses, setSessionError, setHistory, setChildren },
    caches: { inFlight, failed, childrenInFlight, childrenRetryAt },
    isDisposed: () => disposed,
    refreshSessions,
  });
  const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
  const unsubs = [
    api.event.on("session.status", onSessionStatus),
    api.event.on("session.idle", onSessionStatus),
    ...SESSION_REFRESH_EVENTS.map((event) => api.event.on(event, onData)),
    api.event.on("message.updated", onData),
    api.event.on("message.part.updated", onPartData),
  ];
  refreshSessions(true);

  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(ticker);
    dataCoalescer.dispose();
    for (const unsub of unsubs) unsub();
  });

  const panelDeps = (): PanelDeps => ({
    api,
    options,
    now,
    mergedFor,
    partsByMsg,
    flattenParts,
    ensureHistory,
    ensureChildren,
    makeResolveChildId,
    childrenVersion,
    refreshSessions,
    sessions,
    sessionStatuses,
    sessionError,
    hiddenSessionIds: sessionActions.hiddenSessionIds,
    hideSession: sessionActions.hideSession,
    confirmDeleteSession: sessionActions.confirmDeleteSession,
    showHiddenSessions: sessionActions.showHiddenSessions,
  });
  api.slots.register({
    order: 55,
    slots: {
      session_prompt_right(_ctx: TuiSlotContext, props: SlotProps) {
        dataRev();
        return renderPromptTimer(panelDeps(), props.session_id);
      },
    },
  });

  api.slots.register({
    order: SIDEBAR_CONTENT_ORDER,
    slots: {
      sidebar_content(_ctx: TuiSlotContext, props: SlotProps) {
        dataRev();
        const projectPath = currentSessionProjectPath(sessions(), props.session_id);
        return (
          <box flexDirection="column">
            {renderAgentsPanel(panelDeps(), props.session_id)}
            <box height={1} />
            {renderTabs({
              active: activeTab(),
              options,
              theme: api.theme.current,
              select: selectTab,
              ...(projectPath === undefined ? {} : { projectPath }),
            })}
            {activeTab() === "timeline"
              ? renderTimelinePanel(panelDeps(), props.session_id)
              : renderSessionsPanel(panelDeps(), props.session_id)}
          </box>
        ) as unknown as JSX.Element;
      },
    },
  });
};

const plugin: TuiPluginModule & { readonly id: string } = {
  id: "opencode-session-timeline",
  tui,
};

export default plugin;
