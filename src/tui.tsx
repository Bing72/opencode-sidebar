/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui";
import { createSignal, type JSX } from "solid-js";

import { resolveChildIdFrom } from "./agents";
import { createCoalescer } from "./coalesce";
import { createSessionActions } from "./session-actions";
import { createGlobalSessionRefreshClient, createSessionRefresher } from "./session-refresh";
import {
  type ImmediateSessionEvent,
  idleObservedTimesAfterEvent,
  sessionStatusesAfterEvent,
} from "./session-status-events";
import { currentSessionProjectPath, nextSessionBusySpinnerFrameIndex, SESSION_BUSY_SPINNER_TICK_MS } from "./sessions";
import { DEFAULT_SIDEBAR_TAB, SIDEBAR_CONTENT_ORDER, shouldRefreshSessionsOnTabSelect } from "./tabs";
import { createHistoryLoader } from "./tui-history";
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

const TICK_MS = 60_000;
const DATA_THROTTLE_MS = 500;

function strField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = (rawOptions as PluginOptions | undefined) ?? {};
  const [now, setNow] = createSignal(Date.now());
  const [dataRev, setDataRev] = createSignal(0);
  const [sessionBusySpinnerFrameIndex, setSessionBusySpinnerFrameIndex] = createSignal(0);
  const [activeTab, setActiveTab] = createSignal<SidebarTab>(DEFAULT_SIDEBAR_TAB);
  const [sessions, setSessions] = createSignal<ReadonlyArray<Session>>([]);
  const [sessionStatuses, setSessionStatuses] = createSignal<ReadonlyMap<string, SessionStatus>>(new Map());
  const [idleObservedAt, setIdleObservedAt] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [sessionError, setSessionError] = createSignal<string | undefined>();
  let disposed = false;

  const histories = createHistoryLoader({
    dataRev,
    fetchHistory: (sid, limit) =>
      api.client.session.messages({ sessionID: sid, limit }).then((res) =>
        res.data?.map((item) => ({
          info: item.info,
          parts: item.parts,
        })),
      ),
    isDisposed: () => disposed,
    liveEnvelopes: (sid) => api.state.session.messages(sid).map((info) => ({ info, parts: api.state.part(info.id) })),
    setDataRev,
    setSessionError,
  });

  const refreshSessions = createSessionRefresher(createGlobalSessionRefreshClient(api.client.session), {
    isDisposed: () => disposed,
    now: Date.now,
    onRefreshSuccess: histories.onRefreshSuccess,
    setError: setSessionError,
    setSessions,
    setStatuses: setSessionStatuses,
  });

  const refreshVisibleSessionHistories = (): void => {
    histories.requestVisibleHistoryRefresh();
    refreshSessions(true);
  };

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

  const dataCoalescer = createCoalescer<LiveTailUpdate>(DATA_THROTTLE_MS, (updates) => {
    const plan = liveTailFlushPlan(updates, histories.history().keys());
    for (const sid of plan.sessionIds) histories.absorbLiveTail(sid);
    if (plan.refreshSessions) refreshSessions(true);
    setDataRev((value) => value + 1);
  });
  const onData = (event?: { readonly properties?: { readonly sessionID?: string } }): void =>
    dataCoalescer.schedule({ sessionID: event?.properties?.sessionID, refreshSessions: true });
  const onPartData = (event?: { readonly properties?: { readonly sessionID?: string } }): void =>
    dataCoalescer.schedule({ sessionID: event?.properties?.sessionID, refreshSessions: false });
  const onSessionStatus = (event: ImmediateSessionEvent): void => {
    setSessionStatuses((prev) => sessionStatusesAfterEvent(prev, event));
    setIdleObservedAt((prev) => idleObservedTimesAfterEvent(prev, event, Date.now()));
    setDataRev((value) => value + 1);
    onData(event);
  };
  const selectTab = (tab: SidebarTab): void => {
    setActiveTab(tab);
    if (shouldRefreshSessionsOnTabSelect(tab)) refreshVisibleSessionHistories();
  };
  const sessionActions = createSessionActions({
    api,
    signals: {
      sessions,
      setSessions,
      setSessionStatuses,
      setSessionError,
      setHistory: histories.setHistory,
      setChildren,
    },
    caches: { inFlight: histories.inFlight, failed: histories.failed, childrenInFlight, childrenRetryAt },
    isDisposed: () => disposed,
    refreshSessions,
  });
  const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
  const sessionBusySpinnerTicker = setInterval(
    () => setSessionBusySpinnerFrameIndex(nextSessionBusySpinnerFrameIndex),
    SESSION_BUSY_SPINNER_TICK_MS,
  );
  const unsubs = [
    api.event.on("session.status", onSessionStatus),
    api.event.on("session.idle", onSessionStatus),
    ...SESSION_REFRESH_EVENTS.map((event) => api.event.on(event, onData)),
    api.event.on("message.updated", onData),
    api.event.on("message.part.updated", onPartData),
  ];
  refreshVisibleSessionHistories();

  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(ticker);
    clearInterval(sessionBusySpinnerTicker);
    dataCoalescer.dispose();
    for (const unsub of unsubs) unsub();
  });

  const panelDeps = (): PanelDeps => ({
    api,
    options,
    now,
    mergedFor: histories.mergedFor,
    partsByMsg: histories.partsByMsg,
    flattenParts: histories.flattenParts,
    ensureHistory: histories.ensureHistory,
    ensureChildren,
    makeResolveChildId,
    childrenVersion,
    sessionBusySpinnerFrameIndex,
    visibleHistoryRefreshGeneration: histories.visibleHistoryRefreshGeneration,
    refreshSessions,
    sessions,
    sessionStatuses,
    idleObservedAt: (sessionId) => idleObservedAt().get(sessionId),
    sessionError,
    confirmDeleteSession: sessionActions.confirmDeleteSession,
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
