/** @jsxImportSource @opentui/solid */

import type { TuiDialogSelectOption, TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui";
import { useTerminalDimensions } from "@opentui/solid";
import { createSignal, type JSX } from "solid-js";

import { resolveChildIdFrom } from "./agents";
import { createCoalescer } from "./coalesce";
import { createSessionActions } from "./session-actions";
import { loadSessionChildren, loadSessionHistory } from "./session-data";
import { buildSessionSwitchOptions } from "./session-navigation";
import {
  PINNED_SESSION_IDS_KEY,
  parsePinnedSessionIds,
  removePinnedSessionId,
  serializePinnedSessionIds,
  togglePinnedSessionId,
} from "./session-preferences";
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
  HISTORY_INVALIDATION_EVENTS,
  type LiveTailUpdate,
  liveTailFlushPlan,
  markChildrenFetch,
  SESSION_REFRESH_EVENTS,
  type SessionReferenceEvent,
  sessionIdFromEvent,
  withoutMapEntry,
} from "./tui-state";
import type { Part, PluginOptions, Session, SessionStatus, SidebarTab } from "./types";
import {
  type PanelDeps,
  renderAgentsPanel,
  renderAppBottomSessionTitle,
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
  const [sessionFilterQuery, setSessionFilterQuery] = createSignal("");
  const [pinnedSessionIds, setPinnedSessionIds] = createSignal<ReadonlySet<string>>(
    parsePinnedSessionIds(api.kv.get(PINNED_SESSION_IDS_KEY, [])),
  );
  const deletedSessionIds = new Set<string>();
  let sessionMutationEpoch = 0;
  let disposed = false;

  const histories = createHistoryLoader({
    dataRev,
    fetchHistory: (sid, limit) => loadSessionHistory(api.client.session, sid, limit),
    isDisposed: () => disposed,
    isSessionExcluded: (sessionId) => deletedSessionIds.has(sessionId),
    liveEnvelopes: (sid) => api.state.session.messages(sid).map((info) => ({ info, parts: api.state.part(info.id) })),
    setDataRev,
    setSessionError,
  });

  const refreshSessions = createSessionRefresher(createGlobalSessionRefreshClient(api.client.session), {
    excludedSessionIds: () => deletedSessionIds,
    isDisposed: () => disposed,
    now: Date.now,
    onRefreshSuccess: histories.onRefreshSuccess,
    sessionMutationEpoch: () => sessionMutationEpoch,
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
  const childrenFetchVersions = new Map<string, number>();
  const childrenInFlight = new Set<string>();
  const childrenRetryAt = new Map<string, number>();

  const ensureChildren = (sid: string): void => {
    const fetchNow = Date.now();
    if (disposed || childrenInFlight.has(sid) || !canFetchChildren(sid, childrenRetryAt, fetchNow)) return;
    markChildrenFetch(childrenRetryAt, sid, fetchNow);
    const fetchVersion = childrenFetchVersions.get(sid) ?? 0;
    childrenInFlight.add(sid);
    loadSessionChildren(api.client.session, sid)
      .then((loadedChildren) => {
        if (disposed || (childrenFetchVersions.get(sid) ?? 0) !== fetchVersion) return;
        setChildren((prev) => new Map(prev).set(sid, loadedChildren));
        setChildrenVersion((value) => value + 1);
      })
      .catch((error: unknown) => {
        if (disposed || (childrenFetchVersions.get(sid) ?? 0) !== fetchVersion) return;
        setSessionError(error instanceof Error ? error.message : "Failed to load child sessions");
      })
      .finally(() => childrenInFlight.delete(sid));
  };

  const dropChildren = (sid: string): void => {
    childrenFetchVersions.set(sid, (childrenFetchVersions.get(sid) ?? 0) + 1);
    childrenRetryAt.delete(sid);
    setChildren((previous) => {
      if (!previous.has(sid)) return previous;
      const next = new Map(previous);
      next.delete(sid);
      return next;
    });
    setChildrenVersion((value) => value + 1);
  };

  const persistPinnedSessionIds = (ids: ReadonlySet<string>): void => {
    api.kv.set(PINNED_SESSION_IDS_KEY, serializePinnedSessionIds(ids));
  };

  const togglePinnedSession = (sessionId: string): void => {
    setPinnedSessionIds((previous) => {
      const next = togglePinnedSessionId(previous, sessionId);
      persistPinnedSessionIds(next);
      return next;
    });
  };

  const discardSession = (sessionId: string): void => {
    sessionMutationEpoch += 1;
    deletedSessionIds.add(sessionId);
    setSessions((previous) => previous.filter((session) => session.id !== sessionId));
    setSessionStatuses((previous) => withoutMapEntry(previous, sessionId));
    setIdleObservedAt((previous) => withoutMapEntry(previous, sessionId));
    setPinnedSessionIds((previous) => {
      const next = removePinnedSessionId(previous, sessionId);
      if (next !== previous) persistPinnedSessionIds(next);
      return next;
    });
    histories.dropHistory(sessionId);
    dropChildren(sessionId);
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
  const onHistoryInvalidated = (event?: { readonly properties?: { readonly sessionID?: string } }): void => {
    const sessionId = event?.properties?.sessionID;
    if (sessionId !== undefined) histories.invalidateHistory(sessionId);
  };
  const onSessionDeleted = (event?: SessionReferenceEvent): void => {
    const sessionId = sessionIdFromEvent(event);
    if (sessionId !== undefined) discardSession(sessionId);
    onData(event);
  };
  const onSessionCreated = (event?: SessionReferenceEvent): void => {
    const sessionId = sessionIdFromEvent(event);
    if (sessionId !== undefined) {
      sessionMutationEpoch += 1;
      deletedSessionIds.delete(sessionId);
    }
    onData(event);
  };
  const onSessionStatus = (event: ImmediateSessionEvent): void => {
    if (deletedSessionIds.has(event.properties.sessionID)) return;
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
      setSessionError,
    },
    discardSession,
    isDisposed: () => disposed,
    refreshSessions,
  });

  const openSessionFilter = (): void => {
    api.ui.dialog.replace(
      () =>
        (
          <api.ui.DialogPrompt
            title="Filter sessions"
            placeholder="Title, path, slug, or session ID"
            value={sessionFilterQuery()}
            onConfirm={(value) => {
              setSessionFilterQuery(value.trim());
              api.ui.dialog.clear();
            }}
          />
        ) as unknown as JSX.Element,
    );
  };

  const openSessionSwitcher = (): void => {
    const route = api.route.current;
    const currentSessionId = "params" in route ? (strField(route.params?.sessionID) ?? "") : "";
    const options: TuiDialogSelectOption<string>[] = buildSessionSwitchOptions(
      sessions(),
      sessionStatuses(),
      currentSessionId,
      pinnedSessionIds(),
      Date.now(),
    );
    if (options.length === 0) {
      api.ui.toast({ variant: "info", message: "No sessions available" });
      return;
    }
    api.ui.dialog.replace(
      () =>
        (
          <api.ui.DialogSelect
            title="Switch session"
            placeholder="Search sessions"
            options={options}
            current={currentSessionId}
            onSelect={(option) => {
              api.ui.dialog.clear();
              api.route.navigate("session", { sessionID: option.value });
            }}
          />
        ) as unknown as JSX.Element,
    );
  };
  const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
  const sessionBusySpinnerTicker = setInterval(
    () => setSessionBusySpinnerFrameIndex(nextSessionBusySpinnerFrameIndex),
    SESSION_BUSY_SPINNER_TICK_MS,
  );
  const unsubs = [
    api.event.on("session.status", onSessionStatus),
    api.event.on("session.idle", onSessionStatus),
    ...SESSION_REFRESH_EVENTS.map((event) =>
      api.event.on(
        event,
        event === "session.deleted" ? onSessionDeleted : event === "session.created" ? onSessionCreated : onData,
      ),
    ),
    ...HISTORY_INVALIDATION_EVENTS.map((event) => api.event.on(event, onHistoryInvalidated)),
    api.event.on("message.updated", onData),
    api.event.on("message.part.updated", onPartData),
  ];
  refreshVisibleSessionHistories();

  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(ticker);
    clearInterval(sessionBusySpinnerTicker);
    dataCoalescer.dispose();
    histories.dispose();
    for (const unsub of unsubs) unsub();
  });

  const panelDeps = (width: () => number = () => api.renderer.width): PanelDeps => ({
    api,
    options,
    now,
    width,
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
    sessionControls: {
      filterQuery: sessionFilterQuery,
      pinnedSessionIds,
      clearFilter: () => setSessionFilterQuery(""),
      openFilter: openSessionFilter,
      openSwitcher: openSessionSwitcher,
      togglePinnedSession,
    },
  });
  api.slots.register({
    order: 55,
    slots: {
      app_bottom(_ctx: TuiSlotContext) {
        const dimensions = useTerminalDimensions();
        return renderAppBottomSessionTitle({
          route: () => api.route.current,
          getSession: (sessionId) => api.state.session.get(sessionId),
          theme: () => api.theme.current,
          width: () => dimensions().width,
          revision: dataRev,
        });
      },
      session_prompt_right(_ctx: TuiSlotContext, props: SlotProps) {
        const dimensions = useTerminalDimensions();
        dataRev();
        return renderPromptTimer(
          panelDeps(() => dimensions().width),
          props.session_id,
        );
      },
    },
  });

  api.slots.register({
    order: SIDEBAR_CONTENT_ORDER,
    slots: {
      sidebar_content(_ctx: TuiSlotContext, props: SlotProps) {
        dataRev();
        const projectPath = currentSessionProjectPath(sessions(), props.session_id);
        const deps = panelDeps();
        return (
          <box flexDirection="column">
            {renderAgentsPanel(deps, props.session_id)}
            <box height={1} />
            {renderTabs({
              active: activeTab(),
              options,
              theme: api.theme.current,
              select: selectTab,
              ...(projectPath === undefined ? {} : { projectPath }),
            })}
            {activeTab() === "timeline"
              ? renderTimelinePanel(deps, props.session_id)
              : renderSessionsPanel(deps, props.session_id)}
          </box>
        ) as unknown as JSX.Element;
      },
    },
  });
};

const plugin: TuiPluginModule & { readonly id: string } = {
  id: "opencode-sidebar",
  tui,
};

export default plugin;
