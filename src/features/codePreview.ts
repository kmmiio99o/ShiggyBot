/**
 * ShiggyBot - codePreview feature
 * Reworked: improved CODE_LINK_REGEX to capture full path after repo,
 * release detection uses the full URL, and fetch uses redirect: "follow".
 *
 * Note: This file is intended to replace src/features/codePreview.ts
 */

import fetch from "node-fetch";
import { Message, EmbedBuilder, ColorResolvable } from "discord.js";
import { logger } from "../utils/webhookLogger";
import { truncate } from "../utils/helpers";

// Capture code links from common Git hosts. This regex captures:
// 1) fullUrl
// 2) host (raw.githubusercontent.com, github.com, gitlab.com, gitea.com, forgejo.com, bitbucket.org)
// 3) owner
// 4) repo
// 5) pathSegment = everything after owner/repo up to optional
// 6) optional start line
// 7) optional end line
const CODE_LINK_REGEX =
  /https?:\/\/(?:www\.)?(raw\.githubusercontent\.com|github\.com|gitlab\.com|gitea\.com|forgejo\.com|bitbucket\.org)\/([^\/\s]+)\/([^\/\s]+)\/([^#\s]+)(?:#L(\d+)(?:-L(\d+))?)?/gi;

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

// Some known filenames without extensions
const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  "CMakeLists.txt": "cmake",
  Rakefile: "ruby",
  Gemfile: "ruby",
  Procfile: "text",
  Vagrantfile: "ruby",
};

// Raw URL builders for common hosts
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
  "raw.githubusercontent.com": (owner, repo, ref, path) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref || "HEAD"}/${path}`,
};

// Simple rate-limit tracking
const rateLimit = {
  remaining: 60,
  reset: 0,
  used: 0,
};

function detectLanguage(filename: string): string {
  if (!filename) return "text";

  const clean = filename.split(/[?#]/)[0] || "";
  const parts = clean.split("/").filter(Boolean);
  const base = parts.length ? parts[parts.length - 1] : clean;
  const lower = base.toLowerCase();

  // Check known filenames
  if (FILENAME_MAP[base]) return FILENAME_MAP[base];
  if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];

  // Extension
  if (base.includes(".")) {
    const ext = base.split(".").pop()!.toLowerCase();
    if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
    if (/^[a-z0-9+]+$/.test(ext) && ext.length <= 6) return ext;
  }

  return "text";
}

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

    // Attempt a HEAD request first to resolve final redirect targets (useful for release download URLs)
    // If HEAD fails or is not allowed, we'll fall back to GET on the original URL.
    try {
      const headController = new AbortController();
      const headTimeout = setTimeout(() => headController.abort(), 5000);
      const headResp = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "ShiggyBot/1.0 (Code Preview)",
          Accept: "text/plain,*/*;q=0.9",
        },
        signal: headController.signal,
        redirect: "follow",
      });
      clearTimeout(headTimeout);

      // If HEAD succeeded and node-fetch provides final URL, prefer that resolved location.
      // headResp.url will reflect the final location after redirects.
      if (headResp && headResp.url) {
        // Only replace if different (helps with GitHub release redirects)
        if (headResp.url !== url) {
          console.log(
            `[CodePreview] Resolved HEAD redirect: ${url} -> ${headResp.url}`,
          );
          url = headResp.url;
        }
      }
    } catch (headErr) {
      // Non-fatal: some hosts don't allow HEAD or block it; fall back to GET below
      console.warn(
        `[CodePreview] HEAD request failed for ${url}, falling back to GET:`,
        (headErr as any)?.message || headErr,
      );
    }

    // Now perform the GET with a timeout and follow redirects
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for GET

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ShiggyBot/1.0 (Code Preview)",
        Accept: "text/plain,*/*;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      // Rate limited
      const reset = response.headers.get("X-RateLimit-Reset");
      if (reset) rateLimit.reset = parseInt(reset, 10);
      console.warn(
        `[CodePreview] Rate limited fetching ${url}; X-RateLimit-Reset=${reset}`,
      );
      return null;
    }

    if (!response.ok) {
      // Provide more detailed logging for troubleshooting release URLs and redirects
      const contentType = response.headers.get("content-type") || "unknown";
      console.error(
        `❌ Failed to fetch code from ${url}: ${response.status} ${response.statusText} (Content-Type: ${contentType})`,
      );
      return null;
    }

    rateLimit.used++;
    rateLimit.remaining = parseInt(
      response.headers.get("X-RateLimit-Remaining") || "60",
      10,
    );

    // If content-type doesn't look like text, still attempt to read as text but warn
    const ct = response.headers.get("content-type") || "";
    if (
      !/^(text\/|application\/(javascript|json|xml|x-httpd-php)|application\/octet-stream)/i.test(
        ct,
      )
    ) {
      console.warn(
        `[CodePreview] Fetched resource content-type for ${url} is '${ct}', attempting to read as text anyway.`,
      );
    }

    return await response.text();
  } catch (err: any) {
    // node-fetch aborts throw AbortError (name === 'AbortError')
    if (err && err.name === "AbortError") {
      console.error(`❌ Fetch request timed out for ${url}`);
    } else {
      console.error("❌ Error fetching code:", err);
    }
    return null;
  }
}

function extractSnippet(
  code: string,
  startLine: number,
  endLine: number,
): { snippet: string; actualStart: number; actualEnd: number } {
  const lines = code.split("\n");
  const total = lines.length;

  const isDefaultPreview = startLine === 1 && endLine === startLine + 19;
  const actualStart = Math.max(1, Math.min(startLine, total));
  let actualEnd = Math.max(actualStart, Math.min(endLine, total));

  if (isDefaultPreview && total <= 20) actualEnd = total;

  const maxLines = Math.min(actualEnd - actualStart + 1, 20);
  const clampedEnd = actualStart + maxLines - 1;

  const snippetLines = lines.slice(actualStart - 1, clampedEnd);
  const numbered = snippetLines.join("\n");
  return { snippet: numbered, actualStart, actualEnd: clampedEnd };
}

function extractLineNumbersFromUrl(
  url: string,
): { startLine: number; endLine: number } | null {
  const m = url.match(/#L(\d+)(?:-L(\d+))?$/i);
  if (!m) return null;
  const s = parseInt(m[1], 10);
  const e = m[2] ? parseInt(m[2], 10) : s;
  return { startLine: s, endLine: e };
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
  requestedStartLine: number,
  requestedEndLine: number,
  snippet: string,
  language: string,
  actualSnippetStart: number,
  actualSnippetEnd: number,
): EmbedBuilder {
  const filename = filePath.split("/").pop() || filePath;
  const truncatedPath = truncate(filePath, 100);

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
    .setTitle(
      `📄 ${filename} [L${requestedStartLine}${requestedStartLine !== requestedEndLine ? `-L${requestedEndLine}` : ""}]`,
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
      text: `${host} • ${language.toUpperCase()} • ${actualSnippetEnd - actualSnippetStart + 1} lines shown`,
    })
    .setTimestamp();

  return embed;
}

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
 * Process raw code blocks.
 * NOTE: this function only returns embeds for small raw blocks. If you prefer other behavior
 * (delete/repost sanitized), change the handling here. For now we will *not* auto-reply with
 * very large raw blocks and we limit count to avoid spam.
 */
async function processRawCodeBlocks(message: Message): Promise<EmbedBuilder[]> {
  const embeds: EmbedBuilder[] = [];
  const matches = Array.from(message.content.matchAll(RAW_CODE_REGEX));

  let count = 0;
  for (const m of matches) {
    if (count >= 3) break;
    const [, lang, code] = m;
    if (!code || !code.trim()) continue;

    const lines = code.split("\n");
    if (lines.length > 40) continue; // don't preview very large raw blocks

    const detected = lang || detectLanguageFromContent(code);
    const formatted = lines
      .map((line, idx) => {
        const num = (idx + 1).toString().padStart(3, " ");
        return `\`${num}\` ${line}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("📝 Code Snippet")
      .setDescription(`\`\`\`${detected}\n${formatted}\n\`\`\``)
      .setColor(0x5865f2)
      .setFooter({
        text: `From ${message.author.username} • ${lines.length} lines • ${detected.toUpperCase()}`,
      })
      .setTimestamp();

    embeds.push(embed);
    count++;
  }

  return embeds;
}

function detectLanguageFromContent(code: string): string {
  const firstLine = (code || "").split("\n")[0].trim();
  if (!firstLine) return "text";

  if (firstLine.includes("<?php")) return "php";
  if (firstLine.includes("import React")) return "javascript";
  if (firstLine.includes("from ") && firstLine.includes("import "))
    return "python";
  if (firstLine.includes("package ")) return "java";
  if (firstLine.includes("using ") && firstLine.includes(";")) return "csharp";
  if (firstLine.includes("#include")) return "c";
  if (firstLine.includes("fn ") && firstLine.includes("->")) return "rust";
  if (firstLine.includes("func ") && firstLine.includes("{")) return "go";

  if (
    code.includes("<html>") ||
    code.includes("<div>") ||
    code.includes("<span>")
  )
    return "html";
  if (code.includes("{") && code.includes("}") && code.includes(":"))
    return "css";

  return "text";
}

/**
 * Main entry: process message for code previews
 */
export async function autoPreviewCodeLinks(message: Message): Promise<void> {
  if (!message?.content || message.author?.bot) return;

  const embeds: EmbedBuilder[] = [];
  const processedUrls = new Set<string>();

  try {
    // Raw code block embeddings (if any, they will be included but limited)
    const rawEmbeds = await processRawCodeBlocks(message);
    embeds.push(...rawEmbeds);

    // Find code links using the improved regex
    const matches = message.content.matchAll(CODE_LINK_REGEX);
    // matchAll is an iterator; process directly
    for (const m of matches) {
      const [
        fullUrl,
        host,
        owner,
        repo,
        pathSegment,
        startLineStr,
        endLineStr,
      ] = m;
      if (!fullUrl) continue;

      // avoid duplicates
      if (processedUrls.has(fullUrl)) continue;
      processedUrls.add(fullUrl);

      // limit total previews per message
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

    if (embeds.length > 0) {
      // try to suppress embeds if supported
      try {
        if (
          "suppressEmbeds" in message &&
          typeof (message as any).suppressEmbeds === "function"
        ) {
          await (message as any).suppressEmbeds();
        }
      } catch {
        /* ignore */
      }

      // send in batches of 10
      for (let i = 0; i < embeds.length; i += 10) {
        const batch = embeds.slice(i, i + 10);
        try {
          await message.reply({
            embeds: batch,
            allowedMentions: { repliedUser: false },
          });
        } catch (err) {
          try {
            // fallback to channel send
            await (message.channel as any).send({ embeds: batch });
          } catch (err2) {
            console.error("Failed to deliver code preview embeds:", err2);
          }
        }
      }

      logger.info("Code preview generated", {
        messageId: message.id,
        author: message.author?.tag,
        urlCount: processedUrls.size,
        embedCount: embeds.length,
      });
    }
  } catch (err) {
    console.error("Error in code preview:", err);
    await logger.error(err as Error, {
      feature: "codePreview",
      messageId: message.id,
      author: message.author?.tag,
    });
  }
}

/**
 * Process a single captured URL and add embed(s) to `embeds`.
 * Key changes:
 * - CODE_LINK_REGEX now captures the entire pathSegment, so we parse prefixes like 'blob', 'raw', 'releases' here.
 * - Release assets are detected using the fullUrl (important for GitHub release downloads).
 */
async function processCodeUrl(
  fullUrl: string,
  host: string,
  owner: string,
  repo: string,
  pathSegment: string,
  startLineStr: string | undefined,
  endLineStr: string | undefined,
  embeds: EmbedBuilder[],
): Promise<void> {
  // Normalize
  const parts = (pathSegment || "").split("/").filter(Boolean);
  let ref: string | undefined;
  let filePath = "";

  // If the URL looks like a release download (use fullUrl per request), prefer treating it as a release asset
  const isReleaseAsset = /\/releases\/download\//i.test(fullUrl);

  // Common prefixes often present in repo file URLs
  const prefixes = new Set(["blob", "raw", "src", "-/raw", "-/src"]);

  // If path starts with known prefix, strip it
  if (parts.length > 0 && prefixes.has(parts[0])) {
    parts.shift();
  }

  // For typical repo file URLs, first segment is ref, remainder is path
  if (!isReleaseAsset && parts.length > 0) {
    ref = parts.shift();
    filePath = parts.join("/");
    if (ref) ref = ref.split("?")[0];
  } else if (isReleaseAsset) {
    // For release assets we don't have branch; the asset name is the last segment of the full URL
    const urlParts = fullUrl.split("/").filter(Boolean);
    filePath = urlParts[urlParts.length - 1].split(/[?#]/)[0];
    ref = undefined;
  } else {
    // fallback case
    filePath = parts.join("/");
    ref = undefined;
  }

  // Special case: raw.githubusercontent.com uses owner/repo/ref/path (pathSegment includes ref)
  if (host === "raw.githubusercontent.com" && (!ref || !filePath)) {
    const rawParts = pathSegment.split("/").filter(Boolean);
    if (rawParts.length >= 2) {
      ref = rawParts.shift();
      filePath = rawParts.join("/");
    }
  }

  const finalRef = ref || "HEAD";
  const lineNumbers = extractLineNumbersFromUrl(fullUrl);
  const requestedStartLine = startLineStr
    ? parseInt(startLineStr, 10)
    : lineNumbers?.startLine || 1;
  const requestedEndLine = endLineStr
    ? parseInt(endLineStr, 10)
    : lineNumbers?.endLine || requestedStartLine + 19;

  if (
    requestedStartLine < 1 ||
    requestedEndLine < requestedStartLine ||
    requestedEndLine - requestedStartLine > 500
  ) {
    embeds.push(
      createErrorEmbed(
        fullUrl,
        "Invalid Line Range",
        `Line range L${requestedStartLine}-L${requestedEndLine} is invalid. Maximum requested range is 500 lines.`,
      ),
    );
    return;
  }

  // Avoid handling commit pages here
  try {
    const isCommitPath =
      /(?:^|\/)commit\/[0-9a-fA-F]{7,40}(?:\/|$)/i.test(pathSegment) ||
      /\/commits?\/[0-9a-fA-F]{7,40}(?:[?#]|$)/i.test(fullUrl);
    if (isCommitPath) return;
  } catch {
    /* continue */
  }

  // Determine raw URL to fetch:
  // - For release assets use the fullUrl (these are direct downloads)
  // - For normal repo files build raw URL using host-specific builder
  let rawUrl: string | null = null;
  if (isReleaseAsset) {
    rawUrl = fullUrl;
  } else {
    rawUrl = buildRawUrl(host, owner, repo, finalRef, filePath);
  }

  // Final fallback: if buildRawUrl failed but URL clearly looks like a releases/download, use fullUrl
  if (!rawUrl && /\/releases\/download\//i.test(fullUrl)) rawUrl = fullUrl;

  if (!rawUrl) {
    embeds.push(
      createErrorEmbed(
        fullUrl,
        "Unsupported Host",
        `Could not construct a raw URL for host: ${host}`,
      ),
    );
    return;
  }

  // Try fetching
  const code = await fetchCode(rawUrl);
  if (!code) {
    embeds.push(
      createErrorEmbed(
        fullUrl,
        "Could Not Fetch Code",
        `Unable to fetch code from ${fullUrl}. It may be private or unreachable.`,
      ),
    );
    return;
  }

  const language = detectLanguage(filePath);
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
    finalRef,
    filePath,
    requestedStartLine,
    requestedEndLine,
    snippet,
    language,
    actualStart,
    actualEnd,
  );
  embeds.push(embed);
}

export default autoPreviewCodeLinks;
