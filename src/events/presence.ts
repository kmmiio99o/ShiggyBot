/**
 * ShiggyBot/src/events/presence.ts
 *
 * Presence / activity rotation module.
 *
 * Exports:
 * - startPresence(client): start rotating activities with configuration from env vars
 * - setupPresence(client): alias for startPresence to support different import styles
 *
 * Configuration via environment variables:
 * - PRESENCE_STATUS: 'online' | 'idle' | 'dnd' | 'invisible'  (default: 'idle')
 * - PRESENCE_INTERVAL: rotation interval in seconds (default: 5)
 * - PRESENCE_ACTIVITIES:
 *     - JSON array of objects: [{"name":"for /getrole","type":"WATCHING"}, ...]
 *     - OR newline/comma/pipe separated strings like:
 *         "WATCHING:for /getrole|LISTENING:role requests|PLAYING:the server"
 *     - OR simple strings (no type) e.g. "managing roles,with TypeScript" (defaults to PLAYING)
 *
 * Examples:
 *  - PRESENCE_ACTIVITIES='[{"name":"for /getrole","type":"WATCHING"},{"name":"helping","type":"LISTENING"}]'
 *  - PRESENCE_ACTIVITIES='WATCHING:for /getrole|LISTENING:role requests|playing:the server'
 *
 * Notes:
 * - Avoid very short intervals in production. Presence updates are rate-limited by Discord.
 * - This module is defensive: parse failures fall back to a small builtin list.
 */

import { Client, ActivityType, PresenceStatusData } from "discord.js";

type ActivityEntry = {
  name: string;
  type?: ActivityType | keyof typeof ActivityType | string;
};

const DEFAULT_ACTIVITIES: ActivityEntry[] = [
  { name: "welcoming new members", type: ActivityType.Watching },
  { name: "assigning roles", type: ActivityType.Playing },
  { name: "role requests", type: ActivityType.Listening },
  { name: "keeping the server tidy", type: ActivityType.Competing },
  { name: "powered by TypeScript", type: ActivityType.Playing },
];

/**
 * Map friendly type strings (case-insensitive) to discord.js ActivityType values.
 */
function resolveActivityType(input?: string | ActivityType): ActivityType {
  if (input === undefined || input === null) return ActivityType.Playing;
  // If already a number (ActivityType), return it
  if (typeof input === "number") return input as ActivityType;

  const s = String(input).toUpperCase().trim();
  switch (s) {
    case "PLAYING":
      return ActivityType.Playing;
    case "STREAMING":
      return ActivityType.Streaming;
    case "LISTENING":
      return ActivityType.Listening;
    case "WATCHING":
      return ActivityType.Watching;
    case "COMPETING":
      // ActivityType.Competiting spelled 'Competing' in enum
      return ActivityType.Competing ?? ActivityType.Playing;
    default:
      // Unknown -> default to Playing
      return ActivityType.Playing;
  }
}

/**
 * Parse PRESENCE_ACTIVITIES env var into ActivityEntry[]
 */
function parseActivitiesEnv(): ActivityEntry[] {
  const raw = process.env.PRESENCE_ACTIVITIES;
  if (!raw) return DEFAULT_ACTIVITIES;

  // Try JSON first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // normalize entries
      const normalized = parsed
        .map((it) => {
          if (typeof it === "string") {
            return { name: it, type: ActivityType.Playing } as ActivityEntry;
          }
          if (it && typeof it === "object" && "name" in it) {
            return {
              name: String((it as any).name),
              type: (it as any).type,
            } as ActivityEntry;
          }
          return null;
        })
        .filter(Boolean) as ActivityEntry[];
      if (normalized.length > 0) return normalized;
    }
  } catch {
    // Fall through to other parsing strategies
  }

  // Accept separators: pipe |, newline, or comma
  const parts = raw
    .split(/\||\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const entries: ActivityEntry[] = parts.map((piece) => {
    // Allow TYPE:Name syntax
    const m = piece.match(/^([^:]+):(.+)$/);
    if (m) {
      return { name: m[2].trim(), type: m[1].trim() };
    }
    // No explicit type
    return { name: piece, type: ActivityType.Playing };
  });

  if (entries.length === 0) return DEFAULT_ACTIVITIES;
  return entries;
}

/**
 * Build activities array ready to pass to client.user.setPresence
 */
function buildActivities(): { name: string; type?: ActivityType }[] {
  const parsed = parseActivitiesEnv();
  return parsed.map((p) => ({
    name: p.name,
    type: resolveActivityType(p.type as any),
  }));
}

/**
 * Start presence rotation for the provided client.
 *
 * This function returns a cleanup function that will stop the interval when called.
 */
export function startPresence(client: Client): () => void {
  if (!client || !client.user) {
    console.warn(
      "startPresence called but client or client.user is not available yet."
    );
    // Return noop cleanup
    return () => {};
  }

  const statusEnv = (process.env.PRESENCE_STATUS || "idle").toLowerCase();
  // Validate status
  const statuses: PresenceStatusData[] = ["online", "idle", "dnd", "invisible"];
  const status: PresenceStatusData = statuses.includes(
    statusEnv as PresenceStatusData
  )
    ? (statusEnv as PresenceStatusData)
    : "idle";

  // Default rotation: 5 seconds. Minimum enforced to avoid extreme rapid updates.
  const intervalSec = Math.max(5, Number(process.env.PRESENCE_INTERVAL || "5")); // minimum 5s
  const activities = buildActivities();
  if (activities.length === 0) {
    console.warn("No activities found; using default activities.");
  }

  let index = 0;
  const applyActivity = async () => {
    try {
      const act = activities[index % activities.length];
      await client.user?.setPresence({
        activities: [{ name: act.name, type: act.type }],
        status,
      });
      index++;
    } catch (err) {
      // Log but don't throw
      // eslint-disable-next-line no-console
      console.error("Failed to update presence:", err);
    }
  };

  // Set immediately, then on interval
  applyActivity();
  const timer = setInterval(applyActivity, intervalSec * 1000);

  // Return cleanup
  return () => {
    clearInterval(timer);
  };
}

/**
 * Alias for top-level import style compatibility.
 * Some code imports { setupPresence } from './events/presence'
 */
export const setupPresence = startPresence;
