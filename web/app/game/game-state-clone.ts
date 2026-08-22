import type { GameState } from "./types.ts";

/** Structural clone used by the command reducer before simulation stages mutate state. */
export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    themes: Object.fromEntries(
      Object.entries(state.themes).map(([themeId, theme]) => [
        themeId,
        {
          ...theme,
          releasedPartIds: [...theme.releasedPartIds],
          legalLimits: { ...theme.legalLimits },
          partStats: Object.fromEntries(
            Object.entries(theme.partStats).map(([partId, stats]) => [
              partId,
              { ...stats },
            ]),
          ),
        },
      ]),
    ),
    users: { ...state.users },
    finance: { ...state.finance },
    operations: {
      ...state.operations,
      records: state.operations.records.map((record) => ({
        ...record,
        ...(record.riskContext ? { riskContext: { ...record.riskContext } } : {}),
        ...(record.challenge ? { challenge: { ...record.challenge } } : {}),
      })),
      pendingEvent: state.operations.pendingEvent
        ? { ...state.operations.pendingEvent }
        : null,
      eventRecords: state.operations.eventRecords.map((record) => ({ ...record })),
      strategy: { ...state.operations.strategy },
      season: {
        ...state.operations.season,
        boundaries: state.operations.season.boundaries.map((boundary) => ({
          ...boundary,
        })),
      },
    },
    shareholder: {
      ...state.shareholder,
      request: state.shareholder.request
        ? { ...state.shareholder.request }
        : null,
    },
    community: state.community.map((event) => ({ ...event })),
    activeThemeIds: [...state.activeThemeIds],
    supportRequests: state.supportRequests.map((request) => ({ ...request })),
    releaseSlate: state.releaseSlate
      ? {
          ...state.releaseSlate,
          options: state.releaseSlate.options.map((option) => ({ ...option })),
        }
      : null,
    releaseHistory: state.releaseHistory.map((batch) => ({
      ...batch,
      products: batch.products.map((product) => ({ ...product })),
    })),
    genericLimits: { ...state.genericLimits },
    history: state.history.map((entry) => ({
      ...entry,
      shares: { ...entry.shares },
      ...(entry.winRates ? { winRates: { ...entry.winRates } } : {}),
      ...(entry.topCutPlacements
        ? { topCutPlacements: { ...entry.topCutPlacements } }
        : {}),
    })),
    recentRevenue: [...state.recentRevenue],
  };
}
