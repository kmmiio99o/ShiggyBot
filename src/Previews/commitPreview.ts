import fetch from "node-fetch";
import { Message, EmbedBuilder } from "discord.js";

/**
 * Detects commit links (GitHub, Gitea, Forgejo) in a message,
 * fetches commit details and diffs, and sends a formatted embed preview.
 *
 * To use: Call `autoPreviewCommitLinks(message)` in your message handler.
 */

// Regex for GitHub and Forgejo/Gitea commit links
const COMMIT_LINK_REGEX =
  /https?:\/\/([\w\.\-]+)\/([^\/\s]+)\/([^\/\s]+)\/commit\/([a-f0-9]{7,40})/gi;

// Supported hosts and their API endpoints
type HostApiConfig = {
  apiBase: (owner: string, repo: string) => string;
  commitEndpoint: (owner: string, repo: string, sha: string) => string;
  rawDiffUrl: (owner: string, repo: string, sha: string) => string;
};

const HOSTS: Record<string, HostApiConfig> = {
  "github.com": {
    apiBase: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`,
    commitEndpoint: (owner, repo, sha) =>
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
    rawDiffUrl: (owner, repo, sha) =>
      `https://github.com/${owner}/${repo}/commit/${sha}.diff`,
  },
  // Add Forgejo/Gitea support here if needed
};

function getHostConfig(host: string): HostApiConfig | null {
  if (HOSTS[host]) return HOSTS[host];
  // TODO: Add support for custom Forgejo/Gitea instances if needed
  return null;
}

// Utility: Truncate a string to a max length, adding ellipsis if needed
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

// Utility: Format a short diff for Discord (first 10 changed lines, with context)
function formatDiff(diff: string, maxLines = 10): string {
  const lines = diff.split("\n");
  // Only show lines starting with +, -, or context (up to maxLines)
  const filtered = lines.filter(
    (l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@")
  );
  const preview = filtered.slice(0, maxLines);
  let result = preview.join("\n");
  if (filtered.length > maxLines) result += "\n... (truncated)";
  // Use diff syntax highlighting
  return "```diff\n" + result + "\n```";
}

// Main function to process a message and send commit previews
export async function autoPreviewCommitLinks(message: Message): Promise<void> {
  if (!message.content) return;

  let match: RegExpExecArray | null;
  COMMIT_LINK_REGEX.lastIndex = 0;
  const embeds: EmbedBuilder[] = [];

  while ((match = COMMIT_LINK_REGEX.exec(message.content)) !== null) {
    const [fullUrl, host, owner, repo, sha] = match;
    const config = getHostConfig(host);
    if (!config) continue;

    try {
      // Fetch commit details from API
      const commitApiUrl = config.commitEndpoint(owner, repo, sha);
      const res = await fetch(commitApiUrl, {
        headers: { "User-Agent": "ShiggyBot/commitPreview" },
      });
      if (!res.ok) {
        const embed = new EmbedBuilder()
          .setTitle(`Could not fetch commit`)
          .setDescription(`[${owner}/${repo}@${sha}](${fullUrl})`)
          .setColor(0xed4245); // red
        embeds.push(embed);
        continue;
      }
      const commitData = (await res.json()) as {
        commit?: {
          message?: string;
          author?: { name?: string; date?: string };
        };
        files?: Array<{
          filename: string;
          status: string;
          additions: number;
          deletions: number;
        }>;
      };

      // Fetch raw diff (for file previews)
      const diffRes = await fetch(config.rawDiffUrl(owner, repo, sha), {
        headers: { "User-Agent": "ShiggyBot/commitPreview" },
      });
      let diffText = "";
      if (diffRes.ok) diffText = await diffRes.text();

      // Parse commit info
      const commitMsg: string = commitData.commit?.message || "";
      const [title, ...descLines] = commitMsg.split("\n");
      const description = descLines.join("\n").trim();
      const author = commitData.commit?.author?.name || "Unknown";
      const date = commitData.commit?.author?.date || "";
      const files = commitData.files || [];

      // Parse diff for file previews (show up to 3 files)
      let fileFields: { name: string; value: string }[] = [];
      if (diffText) {
        // Split diff by file
        const fileDiffs = diffText.split(/^diff --git /gm).slice(1);
        for (let i = 0; i < Math.min(fileDiffs.length, 3); i++) {
          const fileDiff = fileDiffs[i];
          // Extract filename (after a/ and b/)
          const matchFile = fileDiff.match(/^a\/([^\s]+) b\/([^\s]+)/m);
          const filename = matchFile ? matchFile[2] : "unknown";
          const diffPreview = formatDiff(fileDiff, 10);
          fileFields.push({
            name: truncate(filename, 50),
            value: diffPreview,
          });
        }
        if (fileDiffs.length > 3) {
          fileFields.push({
            name: "…",
            value: `+${
              fileDiffs.length - 3
            } more files changed. [View full diff](${fullUrl})`,
          });
        }
      } else if (files.length) {
        // Fallback: show filenames only
        for (let i = 0; i < Math.min(files.length, 3); i++) {
          fileFields.push({
            name: truncate(files[i].filename, 50),
            value: `\`${files[i].status}\` (${files[i].additions} ++, ${files[i].deletions} --)`,
          });
        }
        if (files.length > 3) {
          fileFields.push({
            name: "…",
            value: `+${
              files.length - 3
            } more files changed. [View full commit](${fullUrl})`,
          });
        }
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle(truncate(title, 256))
        .setURL(fullUrl)
        .setDescription(description ? truncate(description, 512) : null)
        .setColor(0x2ea043) // GitHub green
        .setFooter({
          text: `${owner}/${repo} @ ${sha.slice(0, 7)} • ${author}`,
        })
        .setTimestamp(date ? new Date(date) : undefined);

      for (const field of fileFields) {
        embed.addFields({ name: field.name, value: field.value });
      }

      embeds.push(embed);
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle(`Error fetching commit`)
        .setDescription(`[${owner}/${repo}@${sha}](${fullUrl})`)
        .setColor(0xed4245); // red
      embeds.push(embed);
    }
  }

  if (embeds.length > 0) {
    try {
      if (typeof (message as any).suppressEmbeds === "function") {
        await (message as any).suppressEmbeds(true);
      }
    } catch (err) {}

    // Discord allows up to 10 embeds per message
    for (let i = 0; i < embeds.length; i += 10) {
      await message.reply({ embeds: embeds.slice(i, i + 10) });
    }
  }
}
