import fetch from "node-fetch";
import { Message, EmbedBuilder, ColorResolvable } from "discord.js";
import { logger } from "../utils/webhookLogger";
import { truncate } from "../utils/helpers";

// Updated regex - simplified to catch common patterns
const COMMIT_LINK_REGEX =
  /https?:\/\/(?:github\.com|gitlab\.com|gitea\.com|forgejo\.com|bitbucket\.org)\/([^\/\s]+)\/([^\/\s]+)\/commits?\/([a-f0-9]{7,40})(?:[?#].*)?/gi;

// Simplified API configuration - only GitHub for now
interface GitHostConfig {
  apiBase: string;
  commitUrl: (owner: string, repo: string, sha: string) => string;
}

const GIT_HOSTS: Record<string, GitHostConfig> = {
  "github.com": {
    apiBase: "https://api.github.com",
    commitUrl: (owner, repo, sha) =>
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
  },
  // Add more hosts as needed
};

/**
 * Interface for commit data
 */
interface CommitData {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    name: string;
    date: string;
    avatar?: string;
  };
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    patch?: string; // To hold the diff content
  }>;
  url: string;
}

/**
 * Fetches commit data from GitHub API
 */
async function fetchCommitData(
  host: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<CommitData | null> {
  const config = GIT_HOSTS[host];
  if (!config) {
    console.log(`ℹ️ Host not supported for API: ${host}, trying fallback...`);
    return null;
  }

  try {
    const url = config.commitUrl(owner, repo, sha);
    const headers: Record<string, string> = {
      "User-Agent": "ShiggyBot/1.0",
      Accept: "application/json",
    };

    // Add GitHub token if available
    if (host === "github.com" && process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch commit: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();

    // Transform GitHub data
    if (host === "github.com") {
      return transformGitHubData(data, sha, url);
    }

    return null;
  } catch (error) {
    console.error("❌ Error fetching commit data:", error);
    return null;
  }
}

/**
 * Transforms GitHub API response to our format
 */
function transformGitHubData(data: any, sha: string, url: string): CommitData {
  const shortSha = sha.length > 7 ? sha.substring(0, 7) : sha;

  // Safely get message
  let message = "No commit message";
  try {
    if (data.commit?.message) {
      message = data.commit.message;
    } else if (data.message) {
      message = data.message;
    }
  } catch (error) {
    console.error("Error extracting commit message:", error);
  }

  // Safely get author
  let authorName = "Unknown";
  let authorDate = new Date().toISOString();
  let authorAvatar: string | undefined;

  try {
    if (data.commit?.author?.name) {
      authorName = data.commit.author.name;
      authorDate = data.commit.author.date || authorDate;
    } else if (data.author?.login) {
      authorName = data.author.login;
    }

    if (data.author?.avatar_url) {
      authorAvatar = data.author.avatar_url;
    }
  } catch (error) {
    console.error("Error extracting author info:", error);
  }

  // Safely get stats
  let stats;
  try {
    if (data.stats) {
      stats = {
        additions: data.stats.additions || 0,
        deletions: data.stats.deletions || 0,
        total: data.stats.total || 0,
      };
    }
  } catch (error) {
    console.error("Error extracting stats:", error);
  }

  // Safely get files and their patches
  let files;
  try {
    if (Array.isArray(data.files)) {
      files = data.files.slice(0, 5).map((file: any) => ({
        filename: file.filename || "Unknown",
        status: file.status || "modified",
        patch: file.patch || "", // Extract the patch
      }));
    }
  } catch (error) {
    console.error("Error extracting files:", error);
  }

  return {
    sha,
    shortSha,
    message,
    author: {
      name: authorName,
      date: authorDate,
      avatar: authorAvatar,
    },
    stats,
    files,
    url: data.html_url || url,
  };
}

/**
 * Creates a simple embed for unsupported hosts
 */
function createSimpleCommitEmbed(
  fullUrl: string,
  host: string,
  owner: string,
  repo: string,
  sha: string,
): EmbedBuilder {
  const shortSha = sha.length > 7 ? sha.substring(0, 7) : sha;

  return new EmbedBuilder()
    .setTitle(`📦 Commit ${shortSha}`)
    .setURL(fullUrl)
    .setDescription(`Commit from [${owner}/${repo}](${fullUrl})`)
    .setColor(0x5865f2)
    .addFields(
      { name: "Repository", value: `${owner}/${repo}`, inline: true },
      { name: "Host", value: host, inline: true },
      { name: "Commit", value: `\`${shortSha}\``, inline: true },
    )
    .setFooter({ text: "View commit on " + host })
    .setTimestamp();
}

/**
 * Creates commit embed from commit data
 */
function createCommitEmbed(
  commit: CommitData,
  host: string,
  owner: string,
  repo: string,
): EmbedBuilder {
  const { shortSha, message, author, stats, files, url } = commit;

  // Parse commit message
  const [title, ...descriptionLines] = message.split("\n");
  const description = descriptionLines.join("\n").trim();

  // Determine embed color
  let color: ColorResolvable = 0x5865f2;
  if (stats) {
    const totalChanges = stats.additions + stats.deletions;
    if (totalChanges > 500) {
      color = 0xff5555;
    } else if (totalChanges > 100) {
      color = 0xffaa00;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`📦 ${truncate(title, 256)}`)
    .setURL(url)
    .setColor(color)
    .setAuthor({
      name: author.name,
      iconURL: author.avatar,
      url:
        host === "github.com" ? `https://github.com/${author.name}` : undefined,
    })
    .setFooter({
      text: `${owner}/${repo} @ ${shortSha} • ${host}`,
    })
    .setTimestamp(new Date(author.date));

  // Add description if present
  if (description) {
    embed.setDescription(`\`\`\`\n${truncate(description, 500)}\n\`\`\``);
  }

  // Add diff view if files with patches are available
  let diffDisplayed = false;
  if (files && files.length > 0) {
    let diffContent = "";
    // Filter for files that actually have patch data
    const filesWithPatches = files.filter((file) => file.patch);
    // Limit to 2 files to avoid exceeding embed limits and keep it concise
    for (const file of filesWithPatches.slice(0, 2)) {
      if (file.patch) {
        // Add file header and the patch itself
        diffContent += `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}\n\n`;
      }
    }

    if (diffContent) {
      // Truncate the entire diff content to fit Discord's field value limit (1024 chars)
      const truncatedDiff = truncate(diffContent, 1000);
      embed.addFields({
        name: `📊 Code Changes (${filesWithPatches.length} files with diffs)`,
        value: `\`\`\`diff\n${truncatedDiff}\n\`\`\``,
        inline: false,
      });
      diffDisplayed = true;
    }
  }

  // Fallback to showing only stats if no diff is available or files have no patches
  if (!diffDisplayed && stats) {
    embed.addFields({
      name: "📊 Changes",
      value: `\`\`\`diff\n+${stats.additions} additions\n-${stats.deletions} deletions\n\`\`\``,
      inline: true,
    });
  }

  // Add file list if diff is not displayed OR if there are more files than patches shown in the diff.
  // This ensures we always provide some context about changed files.
  const filesWithPatchCount = files?.filter((file) => file.patch).length || 0;
  if (
    files &&
    files.length > 0 &&
    (!diffDisplayed || filesWithPatchCount < files.length)
  ) {
    const fileList = files
      .map((file) => {
        const icon = getFileIcon(file.filename);
        const status = getStatusIcon(file.status);
        return `${icon} ${status} \`${truncate(file.filename, 30)}\``;
      })
      .join("\n");

    embed.addFields({
      name: `📁 Changed Files (${files.length})`,
      value: fileList,
      inline: false,
    });
  }

  return embed;
}

/**
 * Creates error embed
 */
function createErrorEmbed(
  url: string,
  title: string,
  description: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setURL(url)
    .setDescription(description)
    .setColor(0xff5555)
    .setTimestamp();
}

/**
 * Gets file icon based on extension
 */
function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const iconMap: Record<string, string> = {
    js: "🟨",
    ts: "🔷",
    jsx: "⚛️",
    tsx: "⚛️",
    py: "🐍",
    java: "☕",
    cs: "💠",
    cpp: "🔧",
    c: "🔧",
    go: "🐹",
    rs: "🦀",
    php: "🐘",
    rb: "💎",
    swift: "🐦",
    kt: "⚡",
    html: "🌐",
    css: "🎨",
    scss: "🎨",
    json: "📋",
    yml: "📋",
    yaml: "📋",
    md: "📝",
    txt: "📄",
    sh: "🐚",
    dockerfile: "🐳",
    lock: "🔒",
  };

  return iconMap[ext] || "📄";
}

/**
 * Gets status icon
 */
function getStatusIcon(status: string): string {
  const iconMap: Record<string, string> = {
    added: "➕",
    removed: "➖",
    modified: "📝",
    renamed: "↔️",
    copied: "📋",
  };

  return iconMap[status.toLowerCase()] || "📝";
}

/**
 * Main function to process commit links in a message
 */
export async function autoPreviewCommitLinks(message: Message): Promise<void> {
  if (!message.content || message.author.bot) return;

  const embeds: EmbedBuilder[] = [];
  const processedCommits = new Set<string>();

  try {
    // Process commit links
    const commitMatches = message.content.matchAll(COMMIT_LINK_REGEX);

    for (const match of commitMatches) {
      try {
        const [fullUrl, owner, repo, sha] = match;
        const host = extractHostFromUrl(fullUrl);

        if (!host) {
          console.log(`⚠️ Could not extract host from URL: ${fullUrl}`);
          continue;
        }

        if (processedCommits.has(fullUrl)) continue;
        processedCommits.add(fullUrl);

        // Limit to 2 commit previews per message
        if (embeds.length >= 2) break;

        // Validate SHA
        if (!sha || sha.length < 7) {
          console.log(`⚠️ Invalid SHA: ${sha} from URL: ${fullUrl}`);
          continue;
        }

        // Try to fetch commit data from API
        const commit = await fetchCommitData(host, owner, repo, sha);

        if (commit) {
          const embed = createCommitEmbed(commit, host, owner, repo);
          embeds.push(embed);
        } else {
          // Fallback to simple embed
          console.log(`ℹ️ Using fallback embed for ${host}`);
          const embed = createSimpleCommitEmbed(
            fullUrl,
            host,
            owner,
            repo,
            sha,
          );
          embeds.push(embed);
        }
      } catch (matchError) {
        console.error("❌ Error processing commit match:", matchError);
        continue;
      }
    }

    // Send embeds if we have any
    if (embeds.length > 0) {
      try {
        // Try to suppress original message embeds
        if (
          "suppressEmbeds" in message &&
          typeof message.suppressEmbeds === "function"
        ) {
          await (message as any).suppressEmbeds();
        }
      } catch (error) {
        // Ignore if we can't suppress embeds
      }

      // Send embeds
      for (let i = 0; i < embeds.length; i += 10) {
        const batch = embeds.slice(i, i + 10);

        try {
          await message.reply({
            embeds: batch,
            allowedMentions: { repliedUser: false },
          });
        } catch (error) {
          console.error("❌ Failed to send commit preview:", error);
          // Try sending without reply
          try {
            await (message.channel as any).send({ embeds: batch });
          } catch (sendError) {
            console.error(
              "❌ Failed to send commit preview to channel:",
              sendError,
            );
          }
        }
      }

      // Log successful preview
      logger.info("Commit preview generated", {
        messageId: message.id,
        author: message.author.tag,
        commitCount: processedCommits.size,
        embedCount: embeds.length,
      });
    }
  } catch (error) {
    console.error("❌ Error in commit preview:", error);
    await logger.error(error as Error, {
      feature: "commitPreview",
      messageId: message.id,
      author: message.author.tag,
    });
  }
}

/**
 * Extracts host from URL
 */
function extractHostFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error("❌ Failed to parse URL:", url, error);
    return null;
  }
}

// Export for standalone use
export default autoPreviewCommitLinks;
