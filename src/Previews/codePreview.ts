import fetch from "node-fetch";
import { Message, EmbedBuilder } from "discord.js";

/**
 * Automatically detects GitHub/Gitea/Forgejo code links with line numbers in a message,
 * fetches the referenced code, and returns a formatted code preview (max 20 lines).
 *
 * To use: Call `autoPreviewCodeLinks(message)` in your message handler.
 */

// Regex for GitHub and Forgejo/Gitea links with line numbers
const CODE_LINK_REGEX =
  /https?:\/\/([\w\.\-]+)\/([^\/\s]+)\/([^\/\s]+)\/blob\/([^\/\s]+)\/([^\s#]+)#L(\d+)(?:-L(\d+))?/gi;

// Map file extensions to code block languages
function getLanguageFromExtension(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return "";
  const map: Record<string, string> = {
    ts: "ts",
    js: "js",
    py: "py",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    go: "go",
    rs: "rust",
    sh: "bash",
    md: "md",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    html: "html",
    css: "css",
    php: "php",
    kt: "kotlin",
    swift: "swift",
    dart: "dart",
  };
  return map[ext] || "";
}

// Build the raw file URL for supported hosts
function buildRawUrl(
  host: string,
  owner: string,
  repo: string,
  ref: string,
  path: string
): string | null {
  if (host === "github.com") {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  }
  // Forgejo/Gitea (common default)
  // e.g. https://forgejo.example.com/{owner}/{repo}/raw/{ref}/{path}
  return `https://${host}/${owner}/${repo}/raw/${ref}/${path}`;
}

// Main function to process a message and send code previews
export async function autoPreviewCodeLinks(message: Message): Promise<void> {
  if (!message.content) return;

  // Find all code links in the message
  let match: RegExpExecArray | null;
  CODE_LINK_REGEX.lastIndex = 0;
  const embeds: EmbedBuilder[] = [];

  while ((match = CODE_LINK_REGEX.exec(message.content)) !== null) {
    const [
      fullUrl,
      host,
      owner,
      repo,
      ref,
      filePath,
      startLineStr,
      endLineStr,
    ] = match;

    const startLine = parseInt(startLineStr, 10);
    const endLine = endLineStr ? parseInt(endLineStr, 10) : startLine;
    const maxEndLine = Math.min(endLine, startLine + 19);

    const rawUrl = buildRawUrl(host, owner, repo, ref, filePath);
    if (!rawUrl) continue;

    try {
      const res = await fetch(rawUrl);
      if (!res.ok) {
        const embed = new EmbedBuilder()
          .setTitle(`Could not fetch code`)
          .setDescription(
            `[${owner}/${repo}/${filePath}#L${startLine}-L${endLine}](${fullUrl})`
          )
          .setColor(0xed4245); // red
        embeds.push(embed);
        continue;
      }
      const text = await res.text();
      const lines = text.split("\n");
      // Clamp line numbers to file length
      const safeStart = Math.max(1, Math.min(startLine, lines.length));
      const safeEnd = Math.max(safeStart, Math.min(maxEndLine, lines.length));
      const snippet = lines.slice(safeStart - 1, safeEnd).join("\n");
      const truncated =
        safeEnd - safeStart + 1 >= 20 && safeEnd < endLine
          ? "\n... (truncated)"
          : "";

      const lang = getLanguageFromExtension(filePath);
      const codeBlock = "```" + lang + "\n" + snippet + truncated + "\n```";
      const embed = new EmbedBuilder()
        .setTitle(`${filePath} [L${safeStart}-L${safeEnd}]`)
        .setURL(fullUrl)
        .setDescription(codeBlock)
        .setColor(0x5865f2)
        .setFooter({ text: `${owner}/${repo} @ ${ref} (${host})` });
      embeds.push(embed);
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle(`Error fetching code`)
        .setDescription(
          `[${owner}/${repo}/${filePath}#L${startLine}-L${endLine}](${fullUrl})`
        )
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
