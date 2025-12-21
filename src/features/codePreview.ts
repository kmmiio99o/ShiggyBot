import fetch from "node-fetch";
import { Message, EmbedBuilder, ColorResolvable } from "discord.js";
import { logger } from "../utils/webhookLogger";
import { truncate } from "../utils/helpers";

// Simplified regex to capture common Git hosting links (GitHub, GitLab, Gitea, Forgejo, Bitbucket)
// This regex aims to capture:
// 1. Full URL
// 2. Hostname (e.g., github.com, raw.githubusercontent.com)
// 3. Owner
// 4. Repository name
// 5. The full path segment including branch/commit and file path (e.g., "blob/main/src/file.ts" or "main/src/file.ts")
// 6. Optional start line number (#L123)
// 7. Optional end line number (#L123-L456)
const CODE_LINK_REGEX =
  /https?:\/\/(?:www\.)?((?:raw\.githubusercontent\.com)|(?:github\.com)|(?:gitlab\.com)|(?:gitea\.com)|(?:forgejo\.com)|(?:bitbucket\.org))\/([^/\s]+)\/([^/\s]+)\/((?:(?:blob|src|raw|\-\/raw)\/)?(?:[^/\s]+)\/(?:[^#\s]+)?)(?:#L(\d+)(?:-L(\d+))?)?/gi;

// Regex for raw code blocks within Discord messages
const RAW_CODE_REGEX = /```(\w+)?\n([\s\S]*?)\n```/gi;

// Map file extensions to syntax highlighting languages
const LANGUAGE_MAP: Record<string, string> = {
  // Web
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  vue: "vue",
  svelte: "svelte",

  // Backend
  py: "python",
  rb: "ruby",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  go: "go",
  rs: "rust",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",

  // Data
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  toml: "toml",
  sql: "sql",

  // Config
  md: "markdown",
  txt: "text",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  bat: "batch",
  dockerfile: "dockerfile",
  conf: "nginx",

  // Other
  dart: "dart",
  lua: "lua",
  perl: "perl",
  r: "r",
  hs: "haskell",
};

// Host-specific raw URL builders
const RAW_URL_BUILDERS: Record<
  string,
  (owner: string, repo: string, ref: string, path: string) => string
> = {
  "github.com": (owner, repo, ref, path) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref || "HEAD"}/${path}`,
  "gitlab.com": (owner, repo, ref, path) =>
    `https://gitlab.com/${owner}/${repo}/-/raw/${ref || "HEAD"}/${path}`,
  "gitea.com": (owner, repo, ref, path) =>
    `https://gitea.com/${owner}/${repo}/raw/${ref || "HEAD"}/${path}`,
  "forgejo.com": (owner, repo, ref, path) =>
    `https://forgejo.com/${owner}/${repo}/raw/${ref || "HEAD"}/${path}`,
  "bitbucket.org": (owner, repo, ref, path) =>
    `https://bitbucket.org/${owner}/${repo}/raw/${ref || "HEAD"}/${path}`,
  "raw.githubusercontent.com": (
    owner,
    repo,
    ref,
    path, // This host is already a raw URL base
  ) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref || "HEAD"}/${path}`,
};

// API rate limit tracking (simplified, general purpose for raw fetches)
const rateLimit = {
  remaining: 60,
  reset: 0,
  used: 0,
};

/**
 * Extracts language from file extension or filename
 */
function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_MAP[ext] || ext || "text";
}

/**
 * Builds raw URL based on host
 */
function buildRawUrl(
  host: string,
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string | null {
  const builder = RAW_URL_BUILDERS[host];
  return builder ? builder(owner, repo, ref, path) : null;
}

/**
 * Checks rate limits and waits if necessary
 */
async function checkRateLimit(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Reset rate limit if past reset time
  if (now > rateLimit.reset) {
    rateLimit.remaining = 60;
    rateLimit.used = 0;
    rateLimit.reset = now + 3600; // 1 hour from now
  }

  // If we're out of requests, wait until reset
  if (rateLimit.remaining <= 0) {
    const waitTime = rateLimit.reset - now + 1;
    if (waitTime > 0) {
      console.log(`⏳ Rate limit reached. Waiting ${waitTime} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      rateLimit.remaining = 60;
      rateLimit.used = 0;
    }
  }
}

/**
 * Fetches code from URL with proper error handling and timeout
 */
async function fetchCode(url: string): Promise<string | null> {
  try {
    await checkRateLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ShiggyBot/1.0 (Code Preview)",
        Accept: "text/plain",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      // Rate limited
      const reset = response.headers.get("X-RateLimit-Reset");
      if (reset) {
        rateLimit.reset = parseInt(reset, 10);
      }
      return null;
    }

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch code from ${url}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    rateLimit.used++;
    rateLimit.remaining = parseInt(
      response.headers.get("X-RateLimit-Remaining") || "60",
      10,
    );

    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(`❌ Fetch request timed out for ${url}`);
    } else {
      console.error("❌ Error fetching code:", error);
    }
    return null;
  }
}

/**
 * Extracts a code snippet with line numbers
 */
function extractSnippet(
  code: string,
  startLine: number,
  endLine: number,
): { snippet: string; actualStart: number; actualEnd: number } {
  const lines = code.split("\n");
  const totalLines = lines.length;

  // If endLine is startLine + 19 (our default) and startLine is 1,
  // we're showing the first 20 lines by default
  const isDefaultPreview = startLine === 1 && endLine === startLine + 19;

  // Clamp line numbers to valid range
  const actualStart = Math.max(1, Math.min(startLine, totalLines));
  let actualEnd = Math.max(actualStart, Math.min(endLine, totalLines));

  // If this is a default preview and the file is short, show all lines
  if (isDefaultPreview && totalLines <= 20) {
    actualEnd = totalLines;
  }

  // Limit to 20 lines maximum for the displayed snippet
  const maxLinesDisplay = Math.min(actualEnd - actualStart + 1, 20);
  const clampedEnd = actualStart + maxLinesDisplay - 1;

  const snippetLines = lines.slice(actualStart - 1, clampedEnd);

  // Add line numbers
  const numberedSnippet = snippetLines
    .map((line, index) => {
      const lineNum = actualStart + index;
      const padding = " ".repeat(Math.max(0, 4 - lineNum.toString().length));
      return `\`${padding}${lineNum}\` ${line}`;
    })
    .join("\n");

  return {
    snippet: numberedSnippet,
    actualStart,
    actualEnd: clampedEnd,
  };
}

/**
 * Extracts line numbers and optional line range from a URL hash.
 * @param url The full URL string.
 * @returns An object with startLine and endLine, or null if no lines are specified.
 */
function extractLineNumbersFromUrl(
  url: string,
): { startLine: number; endLine: number } | null {
  const match = url.match(/#L(\d+)(?:-L(\d+))?$/i);
  if (!match) return null;

  const startLine = parseInt(match[1], 10);
  const endLine = match[2] ? parseInt(match[2], 10) : startLine;

  return { startLine, endLine };
}

/**
 * Creates a code preview embed
 */
function createCodeEmbed(
  url: string,
  host: string,
  owner: string,
  repo: string,
  ref: string,
  filePath: string,
  requestedStartLine: number, // Original start line requested by user
  requestedEndLine: number, // Original end line requested by user
  snippet: string,
  language: string,
  actualSnippetStart: number, // Actual start line of the displayed snippet
  actualSnippetEnd: number, // Actual end line of the displayed snippet
): EmbedBuilder {
  const filename = filePath.split("/").pop() || filePath;
  const truncatedPath = truncate(filePath, 100);

  // Determine embed color based on language
  const languageColors: Record<string, ColorResolvable> = {
    javascript: 0xf7df1e,
    typescript: 0x3178c6,
    python: 0x3776ab,
    java: 0x007396,
    csharp: 0x239120,
    cpp: 0x00599c,
    go: 0x00add8,
    rust: 0xdea584,
    php: 0x777bb4,
    ruby: 0xcc342d,
  };

  const embed = new EmbedBuilder()
    // Use the *requested* line numbers for the title to reflect what the user asked for
    .setTitle(
      `📄 ${filename} [L${requestedStartLine}${
        requestedStartLine !== requestedEndLine ? `-L${requestedEndLine}` : ""
      }]`,
    )
    .setURL(url)
    .setColor(languageColors[language] || 0x5865f2)
    .setDescription(`\`\`\`${language}\n${snippet}\n\`\`\``)
    .addFields(
      {
        name: "Repository",
        value: `[${owner}/${repo}](${url.split("#")[0]})`,
        inline: true,
      },
      { name: "Branch/Tag", value: `\`${ref}\``, inline: true },
      { name: "Path", value: `\`${truncatedPath}\``, inline: false },
    )
    .setFooter({
      // Use the *actual* snippet lines for the footer count
      text: `${host} • ${language.toUpperCase()} • ${
        actualSnippetEnd - actualSnippetStart + 1
      } lines shown`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Creates an error embed
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
 * Process raw code blocks in message
 */
async function processRawCodeBlocks(message: Message): Promise<EmbedBuilder[]> {
  const embeds: EmbedBuilder[] = [];
  const matches = message.content.matchAll(RAW_CODE_REGEX);

  let blockCount = 0;
  for (const match of matches) {
    if (blockCount >= 3) break; // Limit to 3 code blocks per message

    const [, language, code] = match;
    if (!code.trim()) continue;

    const detectedLang = language || detectLanguageFromContent(code);
    const lines = code.split("\n");

    // Skip if too many lines
    if (lines.length > 30) {
      continue;
    }

    // Format code with line numbers
    const formattedCode = lines
      .map((line, index) => {
        const lineNum = (index + 1).toString().padStart(3, " ");
        return `\`${lineNum}\` ${line}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`📝 Code Snippet`)
      .setDescription(`\`\`\`${detectedLang}\n${formattedCode}\n\`\`\``)
      .setColor(0x5865f2)
      .setFooter({
        text: `From ${message.author.username} • ${lines.length} lines • ${detectedLang.toUpperCase()}`,
      })
      .setTimestamp();

    embeds.push(embed);
    blockCount++;
  }

  return embeds;
}

/**
 * Detect language from code content
 */
function detectLanguageFromContent(code: string): string {
  const firstLine = code.split("\n")[0].trim();

  // Common patterns
  if (firstLine.includes("<?php")) return "php";
  if (firstLine.includes("import React")) return "javascript";
  if (firstLine.includes("from ") && firstLine.includes("import "))
    return "python";
  if (firstLine.includes("package ")) return "java";
  if (firstLine.includes("using ") && firstLine.includes(";")) return "csharp";
  if (firstLine.includes("#include")) return "c";
  if (firstLine.includes("fn ") && firstLine.includes("->")) return "rust";
  if (firstLine.includes("func ") && firstLine.includes("{")) return "go";

  // Check for HTML tags
  if (
    code.includes("<html>") ||
    code.includes("<div>") ||
    code.includes("<span>")
  ) {
    return "html";
  }

  // Check for CSS
  if (code.includes("{") && code.includes("}") && code.includes(":")) {
    return "css";
  }

  return "text";
}

/**
 * Main function to process code links in a message
 */
export async function autoPreviewCodeLinks(message: Message): Promise<void> {
  console.log(
    `[CodePreview] autoPreviewCodeLinks called for message ID: ${message.id}, content: ${message.content}`,
  );
  if (!message.content || message.author.bot) {
    console.log(
      `[CodePreview] Skipping message (bot or no content): ${message.id}`,
    );
    return;
  }

  const embeds: EmbedBuilder[] = [];
  const processedUrls = new Set<string>();

  try {
    // Process raw code blocks first
    const rawCodeEmbeds = await processRawCodeBlocks(message);
    embeds.push(...rawCodeEmbeds);

    // Process code links
    const matches = message.content.matchAll(CODE_LINK_REGEX);
    console.log(
      `[CodePreview] Found ${Array.from(matches).length} potential code link matches.`,
    );
    // Re-run matchAll because it's an iterator and needs to be reset if consumed by Array.from
    const refreshedMatches = message.content.matchAll(CODE_LINK_REGEX);

    for (const match of refreshedMatches) {
      const [
        fullUrl,
        host,
        owner,
        repo,
        pathSegment,
        startLineStr,
        endLineStr,
      ] = match;
      console.log(`[CodePreview] Processing code link: ${fullUrl}`);

      // Avoid processing same URL multiple times
      if (processedUrls.has(fullUrl)) continue;
      processedUrls.add(fullUrl);

      // Limit to 3 code previews per message
      if (embeds.length >= 3) break;

      await processCodeUrl(
        fullUrl,
        host,
        owner,
        repo,
        pathSegment,
        startLineStr,
        endLineStr,
        embeds,
      );
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

      // Send embeds in batches (Discord limit: 10 embeds per message)
      for (let i = 0; i < embeds.length; i += 10) {
        const batch = embeds.slice(i, i + 10);

        try {
          await message.reply({
            embeds: batch,
            allowedMentions: { repliedUser: false },
          });
        } catch (error) {
          console.error("❌ Failed to send code preview:", error);
          // Try sending without reply
          try {
            await (message.channel as any).send({ embeds: batch });
          } catch (sendError) {
            console.error(
              "❌ Failed to send code preview to channel:",
              sendError,
            );
          }
        }
      }

      // Log successful preview
      logger.info("Code preview generated", {
        messageId: message.id,
        author: message.author.tag,
        urlCount: processedUrls.size,
        embedCount: embeds.length,
      });
    }
  } catch (error) {
    console.error("❌ Error in code preview:", error);
    await logger.error(error as Error, {
      feature: "codePreview",
      messageId: message.id,
      author: message.author.tag,
    });
  }
}

/**
 * Helper function to process a single code URL and add to embeds.
 * Consolidates the logic for fetching and embedding code, including parsing ref and filePath.
 */
async function processCodeUrl(
  fullUrl: string,
  host: string, // Hostname captured from regex
  owner: string,
  repo: string,
  pathSegment: string, // Combined "blob/main/path" or "main/path" segment
  startLineStr: string | undefined,
  endLineStr: string | undefined,
  embeds: EmbedBuilder[],
): Promise<void> {
  let ref: string | undefined;
  let filePath: string;

  // Determine ref and filePath from pathSegment based on host and structure
  const parts = pathSegment.split("/");
  let pathPrefix = ""; // e.g., 'blob', 'src', 'raw', '-/raw'

  // Extract common prefixes like 'blob', 'src', 'raw', '-/raw'
  if (
    parts.length > 1 &&
    ["blob", "src", "raw", "-raw", "-/raw"].includes(parts[0])
  ) {
    pathPrefix = parts.shift()!;
    if (pathPrefix === "-raw") pathPrefix = "-/raw"; // Normalize for bitbucket
  }

  // Now we should have parts like ["main", "src", "index.ts"] or ["i18n", "path", "to", "file.ts"]
  // The first part is likely the branch/ref, and the rest is the file path

  if (parts.length > 0) {
    // Take the first remaining part as the ref (branch/tag/commit)
    ref = parts.shift();
    // The rest is the file path
    filePath = parts.join("/");

    // Clean up the ref if needed (remove any query params, etc.)
    if (ref) {
      ref = ref.split("?")[0]; // Remove any query parameters
    }
  } else {
    // No parts left (edge case), use HEAD and empty file path
    ref = undefined;
    filePath = "";
  }

  // Handle the case where we might have a commit hash vs branch name
  // If ref looks like a commit hash (40 hex chars), keep it as is
  // Otherwise, it's likely a branch name like "main", "dev", "i18n", "test", etc.

  // Fix for GitHub raw URLs that might not have a ref in the pathSegment
  if (host === "raw.githubusercontent.com" && !ref && parts.length === 0) {
    // For raw.githubusercontent.com/owner/repo/ref/path
    // The pathSegment already contains everything after owner/repo/
    const rawParts = pathSegment.split("/");
    if (rawParts.length > 0) {
      ref = rawParts.shift();
      filePath = rawParts.join("/");
    }
  }

  // Fallback if ref couldn't be determined from the path segment structure
  const finalRef = ref || "HEAD";

  const lineNumbers = extractLineNumbersFromUrl(fullUrl);
  // Prioritize line numbers from the URL hash, then from regex captures, then default.
  const requestedStartLine = startLineStr
    ? parseInt(startLineStr, 10)
    : lineNumbers?.startLine || 1;
  const requestedEndLine = endLineStr
    ? parseInt(endLineStr, 10)
    : lineNumbers?.endLine || requestedStartLine + 19; // Default to 20 lines if no end line specified

  // Validate line numbers
  if (
    requestedStartLine < 1 ||
    requestedEndLine < requestedStartLine ||
    requestedEndLine - requestedStartLine > 500 // Max 500 lines can be *requested*, but only 20 *displayed*
  ) {
    const errorEmbed = createErrorEmbed(
      fullUrl,
      "Invalid Line Range",
      `Line range L${requestedStartLine}-L${requestedEndLine} is invalid. Maximum requested range is 500 lines. Displayed snippet is capped at 20 lines.`,
    );
    embeds.push(errorEmbed);
    return;
  }

  // If this looks like a commit URL (e.g. contains '/commit/<sha>' or '/commits/<sha>'), skip handling here.
  // Commit previews are handled by commitPreview.ts to avoid duplicate or conflicting embeds.
  try {
    const isCommitPath =
      /(?:^|\/)commit\/[0-9a-fA-F]{7,40}(?:\/|$)/i.test(pathSegment) ||
      /\/commits?\/[0-9a-fA-F]{7,40}(?:[?#]|$)/i.test(fullUrl);
    if (isCommitPath) {
      console.log(
        `[CodePreview] Skipping commit URL so commitPreview can handle it: ${fullUrl}`,
      );
      return;
    }
  } catch (e) {
    // If any unexpected error occurs while checking, fall back to normal behavior.
    console.warn(
      "[CodePreview] Commit detection failed, continuing with code preview:",
      e,
    );
  }

  const rawUrl = buildRawUrl(host, owner, repo, finalRef, filePath);

  if (!rawUrl) {
    console.warn(`❌ Unsupported host for raw URL conversion: ${host}`);
    const errorEmbed = createErrorEmbed(
      fullUrl,
      "Unsupported Host",
      `The host '${host}' is not supported for code preview.`,
    );
    embeds.push(errorEmbed);
    return;
  }

  console.log(
    `[CodePreview] Raw URL: ${rawUrl}, Ref: ${finalRef}, Path: ${filePath}`,
  );

  const language = detectLanguage(filePath);
  const code = await fetchCode(rawUrl);

  if (!code) {
    const errorEmbed = createErrorEmbed(
      fullUrl,
      "Could Not Fetch Code",
      `Unable to fetch code from [${owner}/${repo}/${filePath}](${fullUrl}). It might be a private repository, an invalid path, or a rate limit issue.`,
    );
    embeds.push(errorEmbed);
    return;
  }

  const { snippet, actualStart, actualEnd } = extractSnippet(
    code,
    requestedStartLine,
    requestedEndLine,
  );

  const embed = createCodeEmbed(
    fullUrl,
    host,
    owner,
    repo,
    finalRef, // This should now show "main", "dev", "i18n", etc.
    filePath,
    requestedStartLine, // For embed title (what user requested)
    requestedEndLine, // For embed title (what user requested)
    snippet,
    language,
    actualStart, // Actual start line of the snippet
    actualEnd, // Actual end line of the snippet
  );

  embeds.push(embed);
}

// Export for standalone use
export default autoPreviewCodeLinks;
