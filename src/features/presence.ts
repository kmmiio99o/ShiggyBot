import { Client, ActivityType, PresenceStatusData } from "discord.js";
import { config } from "../config";
import axios from "axios";

type ActivityEntry = {
  name: string;
  type?: ActivityType | string;
};

interface GitHubRepoData {
  stars: number;
  lastCommit: string;
  forks: number;
  openIssues: number;
  language: string;
}

// GitHub API base URL
const GITHUB_API_BASE = "https://api.github.com";
const REPO_OWNER = "kmmiio99o";
const REPO_NAME = "ShiggyCord";

// Cache for GitHub data to avoid rate limiting
let cachedRepoData: GitHubRepoData | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Normalize unknown errors into strings
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err as any);
  } catch {
    return String(err);
  }
}

/**
 * Fetch GitHub repository data
 */
async function fetchGitHubRepoData(): Promise<GitHubRepoData | null> {
  try {
    // Use cache if still valid
    if (cachedRepoData && Date.now() - lastFetchTime < CACHE_DURATION) {
      return cachedRepoData;
    }

    console.log("🌐 Fetching GitHub repository data...");

    const [repoResponse, commitsResponse] = await Promise.all([
      axios.get(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}`, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ShiggyCord-Bot",
        },
        timeout: 10000,
      }),
      axios.get(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/commits`, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ShiggyCord-Bot",
        },
        params: {
          per_page: 1,
        },
        timeout: 10000,
      }),
    ]);

    const repoData = repoResponse.data;
    const lastCommitDate = commitsResponse.data[0]?.commit?.author?.date;

    const formattedData: GitHubRepoData = {
      stars: repoData.stargazers_count || 0,
      lastCommit: lastCommitDate
        ? new Date(lastCommitDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Unknown",
      forks: repoData.forks_count || 0,
      openIssues: repoData.open_issues_count || 0,
      language: repoData.language || "TypeScript",
    };

    // Update cache
    cachedRepoData = formattedData;
    lastFetchTime = Date.now();

    console.log("✅ GitHub data fetched successfully:", {
      stars: formattedData.stars,
      lastCommit: formattedData.lastCommit,
      forks: formattedData.forks,
    });

    return formattedData;
  } catch (error: unknown) {
    console.error("❌ Failed to fetch GitHub data:", getErrorMessage(error));

    // If we have cached data, return it even if expired
    if (cachedRepoData) {
      console.log("⚠️ Returning cached GitHub data");
      return cachedRepoData;
    }

    return null;
  }
}

/**
 * Build dynamic activities based on GitHub data
 */
async function buildDynamicActivities(): Promise<
  { name: string; type: ActivityType }[]
> {
  const gitHubData = await fetchGitHubRepoData();

  const activities: ActivityEntry[] = [];

  if (gitHubData) {
    // Add GitHub-related activities
    activities.push(
      { name: `⭐ ${gitHubData.stars} stars`, type: ActivityType.Watching },
      {
        name: `last commit: ${gitHubData.lastCommit}`,
        type: ActivityType.Watching,
      },
      { name: `${gitHubData.forks} forks`, type: ActivityType.Competing },
      {
        name: `${gitHubData.openIssues} open issues`,
        type: ActivityType.Listening,
      },
      { name: `built with ${gitHubData.language}`, type: ActivityType.Playing },
    );
  }

  // Add fallback/default activities
  const defaultActivities: ActivityEntry[] = [
    { name: "welcoming new members", type: ActivityType.Watching },
    { name: "assigning roles", type: ActivityType.Playing },
    { name: "role requests", type: ActivityType.Listening },
    { name: "keeping the server tidy", type: ActivityType.Competing },
    { name: "powered by TypeScript", type: ActivityType.Playing },
    { name: "ShiggyCord v2.0 when???", type: ActivityType.Playing },
  ];

  // Combine GitHub activities with defaults
  const allActivities = [...activities, ...defaultActivities];

  return allActivities.map((p) => ({
    name: p.name,
    type: resolveActivityType(p.type as any),
  }));
}

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
  if (!raw) return [];

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

  return entries;
}

/**
 * Build activities array
 */
async function buildActivities(): Promise<
  { name: string; type: ActivityType }[]
> {
  // First get custom activities from env
  const parsedEnv = parseActivitiesEnv();
  const envActivities = parsedEnv.map((p) => ({
    name: p.name,
    type: resolveActivityType(p.type as any),
  }));

  // Get dynamic activities from GitHub
  const dynamicActivities = await buildDynamicActivities();

  // Combine: custom env activities first, then dynamic ones
  const allActivities = [...envActivities, ...dynamicActivities];

  // If no activities at all, use fallbacks
  if (allActivities.length === 0) {
    return [
      { name: "ShiggyCord on GitHub", type: ActivityType.Watching },
      { name: "Open Source Project", type: ActivityType.Playing },
      { name: "TypeScript Powered", type: ActivityType.Listening },
    ];
  }

  return allActivities;
}

/**
 * Start presence rotation for the provided client.
 * Returns a cleanup function that will stop the interval when called.
 */
export async function startPresence(client: Client): Promise<() => void> {
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

  const intervalSec = Math.max(30, config.presenceInterval); // Increased minimum to 30 seconds for GitHub API
  let activities = await buildActivities();

  if (activities.length === 0) {
    console.warn("No activities found; using default activities.");
  }

  let index = 0;

  const applyActivity = async () => {
    try {
      if (!client.user) return;

      // Refresh activities every hour to get updated GitHub data
      if (index % Math.floor(3600 / intervalSec) === 0) {
        console.log("🔄 Refreshing GitHub data for activities...");
        activities = await buildActivities();
      }

      const act = activities[index % activities.length];

      void client.user.setPresence({
        activities: [{ name: act.name, type: act.type }],
        status,
      });

      index++;
    } catch (err: unknown) {
      console.error("❌ Failed to update presence:", getErrorMessage(err));
    }
  };

  // Set immediately (kick off but don't await to avoid blocking startup)
  void applyActivity();

  // Wrap the async updater so setInterval receives a sync callback
  const timer = setInterval(() => {
    void applyActivity();
  }, intervalSec * 1000);

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
export function setup(client: Client): Promise<() => void> {
  return startPresence(client);
}

// Ensure default export for dynamic imports
export default { startPresence, setupPresence, setup };
