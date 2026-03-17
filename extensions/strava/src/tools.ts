import { Type } from "@sinclair/typebox";
import type { TokenStore } from "./oauth.js";
import { buildAuthUrl, ensureFreshToken } from "./oauth.js";
import * as client from "./strava-client.js";
import type { StravaConfig } from "./types.js";

interface ToolDeps {
  config: StravaConfig;
  tokenStore: TokenStore;
  getRedirectUri: () => string;
}

function notConnectedResult(deps: ToolDeps) {
  const authUrl = buildAuthUrl(deps.config.clientId, deps.getRedirectUri());
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          connected: false,
          message: "Strava account not connected. The user needs to authorize via the link below.",
          authUrl,
        }),
      },
    ],
  };
}

async function getTokenOrNull(deps: ToolDeps): Promise<string | null> {
  try {
    return await ensureFreshToken(deps.tokenStore, deps.config);
  } catch {
    // Refresh failed — token likely revoked.
    deps.tokenStore.clear();
    return null;
  }
}

function createAuthStatusTool(deps: ToolDeps) {
  return {
    name: "strava_auth_status",
    label: "Strava Auth Status",
    description:
      "Check whether the user's Strava account is connected. If not connected, returns an authorization URL the user can visit to link their account.",
    parameters: Type.Object({}),
    async execute() {
      const tokens = deps.tokenStore.load();
      if (!tokens) return notConnectedResult(deps);

      const token = await getTokenOrNull(deps);
      if (!token) return notConnectedResult(deps);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              connected: true,
              athleteId: tokens.athleteId,
            }),
          },
        ],
      };
    },
  };
}

function createActivitiesTool(deps: ToolDeps) {
  return {
    name: "strava_activities",
    label: "Strava Activities",
    description:
      "List the user's recent Strava activities. Returns distance, pace, duration, heart rate, and other metrics. Use this to review recent training.",
    parameters: Type.Object({
      count: Type.Optional(
        Type.Number({
          description: "Number of activities to return (1-50, default 10).",
          minimum: 1,
          maximum: 50,
        }),
      ),
      sportType: Type.Optional(
        Type.String({
          description: 'Filter by sport type, e.g. "Run", "Ride", "Swim", "TrailRun", "Walk".',
        }),
      ),
      after: Type.Optional(
        Type.String({
          description: "Only activities after this date (ISO 8601, e.g. 2026-01-01).",
        }),
      ),
      before: Type.Optional(
        Type.String({
          description: "Only activities before this date (ISO 8601, e.g. 2026-02-28).",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const token = await getTokenOrNull(deps);
      if (!token) return notConnectedResult(deps);

      const count = (params.count as number | undefined) ?? 10;
      const after = params.after as string | undefined;
      const before = params.before as string | undefined;
      const sportType = params.sportType as string | undefined;

      // When filtering by sport type, fetch extra pages to compensate for
      // mixed-sport results being filtered out client-side.
      const fetchSize = sportType ? Math.min(count * 3, 200) : count;

      let activities = await client.getActivities(token, {
        perPage: fetchSize,
        after,
        before,
      });

      if (sportType) {
        activities = activities
          .filter((a) => a.sport_type.toLowerCase() === sportType.toLowerCase())
          .slice(0, count);
      }

      const formatted = activities.map((a) => ({
        id: a.id,
        name: a.name,
        sportType: a.sport_type,
        date: a.start_date_local,
        distance: client.formatDistance(a.distance),
        distanceMeters: a.distance,
        duration: client.formatDuration(a.moving_time),
        movingTimeSeconds: a.moving_time,
        pace: client.formatPace(a.average_speed),
        averageSpeedMs: a.average_speed,
        elevationGain: `${a.total_elevation_gain.toFixed(0)} m`,
        averageHeartrate: a.average_heartrate ?? null,
        maxHeartrate: a.max_heartrate ?? null,
        sufferScore: a.suffer_score ?? null,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ activities: formatted }) }],
      };
    },
  };
}

function createActivityDetailTool(deps: ToolDeps) {
  return {
    name: "strava_activity_detail",
    label: "Strava Activity Detail",
    description:
      "Get full details for a specific Strava activity including per-km splits, laps, heart rate, calories, and gear. Use the activity ID from strava_activities.",
    parameters: Type.Object({
      activityId: Type.Number({ description: "The Strava activity ID." }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const token = await getTokenOrNull(deps);
      if (!token) return notConnectedResult(deps);

      const activityId = params.activityId as number;
      const detail = await client.getActivity(token, activityId);

      const splits = (detail.splits_metric ?? []).map((s) => ({
        km: s.split,
        distance: client.formatDistance(s.distance),
        duration: client.formatDuration(s.moving_time),
        pace: client.formatPace(s.average_speed),
        averageHeartrate: s.average_heartrate ?? null,
      }));

      const laps = (detail.laps ?? []).map((l) => ({
        name: l.name,
        distance: client.formatDistance(l.distance),
        duration: client.formatDuration(l.moving_time),
        pace: client.formatPace(l.average_speed),
        averageHeartrate: l.average_heartrate ?? null,
        maxHeartrate: l.max_heartrate ?? null,
      }));

      const result = {
        id: detail.id,
        name: detail.name,
        sportType: detail.sport_type,
        date: detail.start_date_local,
        description: detail.description ?? null,
        distance: client.formatDistance(detail.distance),
        distanceMeters: detail.distance,
        duration: client.formatDuration(detail.moving_time),
        movingTimeSeconds: detail.moving_time,
        elapsedTimeSeconds: detail.elapsed_time,
        pace: client.formatPace(detail.average_speed),
        elevationGain: `${detail.total_elevation_gain.toFixed(0)} m`,
        calories: detail.calories,
        averageHeartrate: detail.average_heartrate ?? null,
        maxHeartrate: detail.max_heartrate ?? null,
        averageCadence: detail.average_cadence ?? null,
        gear: detail.gear?.name ?? null,
        device: detail.device_name ?? null,
        splits,
        laps,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  };
}

function createStatsTool(deps: ToolDeps) {
  return {
    name: "strava_stats",
    label: "Strava Stats",
    description:
      "Get the user's aggregated Strava statistics: recent, year-to-date, and all-time totals for running, cycling, and swimming.",
    parameters: Type.Object({}),
    async execute() {
      const tokens = deps.tokenStore.load();
      if (!tokens) return notConnectedResult(deps);

      const token = await getTokenOrNull(deps);
      if (!token) return notConnectedResult(deps);

      const stats = await client.getAthleteStats(token, tokens.athleteId);

      const fmt = (totals: {
        count: number;
        distance: number;
        moving_time: number;
        elevation_gain: number;
      }) => ({
        count: totals.count,
        distance: client.formatDistance(totals.distance),
        distanceMeters: totals.distance,
        duration: client.formatDuration(totals.moving_time),
        movingTimeSeconds: totals.moving_time,
        elevationGain: `${totals.elevation_gain.toFixed(0)} m`,
      });

      const result = {
        running: {
          recent: fmt(stats.recent_run_totals),
          ytd: fmt(stats.ytd_run_totals),
          allTime: fmt(stats.all_run_totals),
        },
        cycling: {
          recent: fmt(stats.recent_ride_totals),
          ytd: fmt(stats.ytd_ride_totals),
          allTime: fmt(stats.all_ride_totals),
        },
        swimming: {
          recent: fmt(stats.recent_swim_totals),
          ytd: fmt(stats.ytd_swim_totals),
          allTime: fmt(stats.all_swim_totals),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  };
}

/** Create all Strava tools. */
export function createStravaTools(deps: ToolDeps) {
  return [
    createAuthStatusTool(deps),
    createActivitiesTool(deps),
    createActivityDetailTool(deps),
    createStatsTool(deps),
  ];
}
