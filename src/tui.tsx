/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui";
import { createSignal, type JSX } from "solid-js";

import { resolveChildIdFrom } from "./agents";
import { createCoalescer } from "./coalesce";
import { capEnvelopes, capSessions, type Envelope, mergeEnvelopes, sanitizeEnvelope } from "./history";
import { nextSidebarTab, SIDEBAR_CONTENT_ORDER, SIDEBAR_TOGGLE_BINDING, SIDEBAR_TOGGLE_COMMAND } from "./tabs";
import { canFetchChildren, markChildrenFetch, sessionIdsForLiveTail } from "./tui-state";
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

const DEFAULT_MAX_SESSIONS = 20;
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
  const [activeTab, setActiveTab] = createSignal<SidebarTab>("timeline");
  const [history, setHistory] = createSignal<ReadonlyMap<string, ReadonlyArray<Envelope>>>(new Map());
  const [sessions, setSessions] = createSignal<ReadonlyArray<Session>>([]);
  const [sessionStatuses, setSessionStatuses] = createSignal<ReadonlyMap<string, SessionStatus>>(new Map());
  const [sessionError, setSessionError] = createSignal<string | undefined>();
  const inFlight = new Set<string>();
  const failed = new Set<string>();
  let sessionsInFlight = false;
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

  const refreshSessions = (): void => {
    if (disposed || sessionsInFlight) return;
    sessionsInFlight = true;
    Promise.all([
      api.client.session.list({ limit: options.maxSessions ?? DEFAULT_MAX_SESSIONS }),
      api.client.session.status(),
    ])
      .then(([listResult, statusResult]) => {
        if (disposed) return;
        setSessions(listResult.data ?? []);
        setSessionStatuses(new Map(Object.entries(statusResult.data ?? {})));
        setSessionError(undefined);
      })
      .catch((error: unknown) => {
        setSessionError(error instanceof Error ? error.message : "Failed to load sessions");
      })
      .finally(() => {
        sessionsInFlight = false;
      });
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

  let mergedKey = "";
  let mergedCache: Envelope[] = [];
  const mergedFor = (sid: string): Envelope[] => {
    const key = `${sid}:${dataRev()}:${history().has(sid) ? "h" : "l"}`;
    if (key === mergedKey) return mergedCache;
    mergedCache = mergeEnvelopes(history().get(sid) ?? [], liveEnvelopes(sid));
    mergedKey = key;
    return mergedCache;
  };

  const dataCoalescer = createCoalescer<string | undefined>(DATA_THROTTLE_MS, (sids) => {
    for (const sid of sessionIdsForLiveTail(sids, history().keys())) absorbLiveTail(sid);
    refreshSessions();
    setDataRev((value) => value + 1);
  });
  const onData = (event?: { readonly properties?: { readonly sessionID?: string } }): void =>
    dataCoalescer.schedule(event?.properties?.sessionID);
  const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
  const sessionTicker = setInterval(refreshSessions, TICK_MS);
  const unsubs = [
    api.event.on("session.status", onData),
    api.event.on("session.idle", onData),
    api.event.on("message.updated", onData),
    api.event.on("message.part.updated", onData),
  ];
  refreshSessions();

  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(ticker);
    clearInterval(sessionTicker);
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
  });

  api.keymap.registerLayer({
    mode: "base",
    commands: [
      {
        name: SIDEBAR_TOGGLE_COMMAND,
        title: "Toggle Timeline/Sessions",
        category: "Timeline",
        run() {
          setActiveTab((tab) => nextSidebarTab(tab));
        },
      },
    ],
    bindings: [{ key: SIDEBAR_TOGGLE_BINDING, cmd: SIDEBAR_TOGGLE_COMMAND, desc: "Switch Timeline/Sessions" }],
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
        return (
          <box flexDirection="column">
            {renderAgentsPanel(panelDeps(), props.session_id)}
            <box height={1} />
            {renderTabs(activeTab(), options, api.theme.current, setActiveTab)}
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
