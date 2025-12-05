import { Client, ActivityType, PresenceStatusData } from "discord.js";
import { config } from "../config";

type ActivityEntry = {
  name: string;
  type?: ActivityType | string;
};

const DEFAULT_ACTIVITIES: ActivityEntry[] = [
  { name: "welcoming new members", type: ActivityType.Watching },
  { name: "assigning roles", type: ActivityType.Playing },
  { name: "role requests", type: ActivityType.Listening },
  { name: "keeping the server tidy", type: ActivityType.Competing },
  { name: "powered by TypeScript", type: ActivityType.Playing },
];

/**
 * Map friendly type strings to discord.js ActivityType
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
      return ActivityType.Competing;
    default:
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
      const normalized = parsed
        .map((it) => {
          if (typeof it === "string") {
            return { name: it, type: ActivityType.Playing };
          }
          if (it && typeof it === "object" && "name" in it) {
            return {
              name: String(it.name),
              type: it.type,
            };
          }
          return null;
        })
        .filter(Boolean) as ActivityEntry[];
      if (normalized.length > 0) return normalized;
    }
  } catch {
    // Fall through
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

  return entries.length > 0 ? entries : DEFAULT_ACTIVITIES;
}

/**
 * Build activities array
 */
function buildActivities(): { name: string; type: ActivityType }[] {
  const parsed = parseActivitiesEnv();
  return parsed.map((p) => ({
    name: p.name,
    type: resolveActivityType(p.type as any),
  }));
}

/**
 * Start presence rotation for the provided client.
 * Returns a cleanup function that will stop the interval when called.
 */
export function startPresence(client: Client): () => void {
  if (!client || !client.user) {
    console.warn(
      "startPresence called but client or client.user is not available yet.",
    );
    return () => {};
  }

  // Get status from config - ensure it's valid
  const statusEnv = (config.presenceStatus || "idle").toLowerCase();
  const validStatuses: PresenceStatusData[] = [
    "online",
    "idle",
    "dnd",
    "invisible",
  ];
  const status: PresenceStatusData = validStatuses.includes(
    statusEnv as PresenceStatusData,
  )
    ? (statusEnv as PresenceStatusData)
    : "idle";

  console.log(`🔄 Setting bot status to: ${status}`);

  const intervalSec = Math.max(15, config.presenceInterval); // Minimum 15 seconds
  const activities = buildActivities();

  if (activities.length === 0) {
    console.warn("No activities found; using default activities.");
  }

  let index = 0;

  const applyActivity = async () => {
    try {
      if (!client.user) return;

      const act = activities[index % activities.length];
      console.log(
        `🔄 Updating presence: ${act.name} (${act.type}) [${status}]`,
      );

      await client.user.setPresence({
        activities: [{ name: act.name, type: act.type }],
        status,
      });

      index++;
    } catch (err) {
      console.error("❌ Failed to update presence:", err);
    }
  };

  // Set immediately
  applyActivity();

  const timer = setInterval(applyActivity, intervalSec * 1000);

  // Return cleanup
  return () => {
    clearInterval(timer);
  };
}

/**
 * Alias for compatibility
 */
export const setupPresence = startPresence;

/**
 * Setup function for event system
 */
export function setup(client: Client): () => void {
  return startPresence(client);
}

// Ensure default export for dynamic imports
export default { startPresence, setupPresence, setup };
