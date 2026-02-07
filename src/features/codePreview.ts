/**
 * ShiggyBot - codePreview feature
 * Reworked to prioritize standard repository files and exclude release links.
 * * Improvements:
 * - Handles branch names with slashes (e.g., feature/login).
 * - Excludes release/download links from embedding.
 * - Added support for .mjs, .cjs, .mts, .cts.
 * - Dynamic rate limit resetting and 1MB file safety limit.
 */

import fetch from "node-fetch";
import { Message, EmbedBuilder, ColorResolvable } from "discord.js";
import { logger } from "../utils/webhookLogger";
import { truncate } from "../utils/helpers";

// Regex captures standard Git host URLs
const CODE_LINK_REGEX =
  /https?:\/\/(?:www\.)?(raw\.githubusercontent\.com|github\.com|gitlab\.com|gitea\.com|forgejo\.com|bitbucket\.org)\/([^\/\s]+)\/([^\/\s]+)\/([^#\s]+)(?:#L(\d+)(?:-L(\d+))?)?/gi;

const LANGUAGE_MAP: Record<string, string> = {
  // Web
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
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

const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  "CMakeLists.txt": "cmake",
  Rakefile: "ruby",
  Gemfile: "ruby",
  Procfile: "text",
  Vagrantfile: "ruby",
};

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

const rateLimit = { remaining: 60, reset: 0 };

/**
 * Checks rate limits and waits if necessary
 */
async function checkRateLimit(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (now > rateLimit.reset) {
    rateLimit.remaining = 60;
    rateLimit.reset = now + 3600; // 1 hour from now
  }
  if (rateLimit.remaining <= 0) {
    const waitTime = Math.max(0, rateLimit.reset - now) + 1;
    await new Promise((res) => setTimeout(res, waitTime * 1000));
  }
}
/**
 * Unindents the code so that it starts from indentation level 0, instead of whatever it was in the source code at that specific location.
 * from: https://github.com/Equicord/Equicord/blob/d5e5ab2670db6570260fb89f5605b213c2962d16/src/plugins/unindent/index.ts#L38-L46
 */
function unindent(str: string) {
    str = str.replace(/\t/g, "    ");
    const minIndent = str.match(/^ *(?=\S)/gm)
      ?.reduce((prev, curr) => Math.min(prev, curr.length), Infinity) ?? 0;

    if (!minIndent) return str;
    return str.replace(new RegExp(`^ {${minIndent}}`, "gm"), "");
}
/**
 * Fetches code from URL with proper error handling and timeout
 */
async function fetchCode(url: string): Promise<string | null> {
  try {
    await checkRateLimit();

    // 1. Create an AbortController
    const controller = new AbortController();
    // 2. Set a timeout to abort the request after 15 seconds
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: { "User-Agent": "ShiggyBot/1.1", Accept: "text/plain" },
      signal: controller.signal, // 3. Pass the signal here
      redirect: "follow",
    });

    // 4. Clear the timeout if the request completes in time
    clearTimeout(timeout);

    const size = parseInt(response.headers.get("content-length") || "0");
    if (size > 1024 * 1024) return null;

    if (response.status === 429) {
      const reset = response.headers.get("x-ratelimit-reset");
      if (reset) rateLimit.reset = parseInt(reset, 10);
      return null;
    }

    return response.ok ? await response.text() : null;
  } catch (error) {
    // If the error was a timeout, it will be an 'AbortError'
    return null;
  }
}

function detectLanguage(filename: string): string {
  const base = filename.split("/").pop()?.toLowerCase() || "";
  if (FILENAME_MAP[base]) return FILENAME_MAP[base];
  const ext = base.split(".").pop() || "";
  return LANGUAGE_MAP[ext] || "text";
}

function extractSnippet(code: string, start: number, end: number) {
  const lines = code.split("\n");
  const actualStart = Math.max(1, Math.min(start, lines.length));
  const actualEnd = Math.min(actualStart + 19, Math.min(end, lines.length));
  return {
    snippet: lines.slice(actualStart - 1, actualEnd).join("\n"),
    actualStart,
    actualEnd,
  };
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
  start: number,
  end: number,
  snippet: string,
  lang: string,
  aStart: number,
  aEnd: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(
      `📄 ${filePath.split("/").pop()} [L${start}${start !== end ? `-L${end}` : ""}]`,
    )
    .setURL(url)
    .setColor(0x5865f2)
    .setDescription(`\`\`\`${lang}\n${snippet}\n\`\`\``)
    .addFields(
      {
        name: "Repository",
        value: `[${owner}/${repo}](${url.split("#")[0]})`,
        inline: true,
      },
      { name: "Branch/Tag", value: `\`${ref}\``, inline: true },
      { name: "Path", value: `\`${truncate(filePath, 100)}\``, inline: false },
    )
    .setFooter({
      text: `${host} • ${lang.toUpperCase()} • ${aEnd - aStart + 1} lines`,
    })
    .setTimestamp();
}

async function processCodeUrl(
  fullUrl: string,
  host: string,
  owner: string,
  repo: string,
  pathSegment: string,
  startStr: string | undefined,
  endStr: string | undefined,
  embeds: EmbedBuilder[],
): Promise<void> {
  // 1. SKIP RELEASE LINKS
  if (fullUrl.includes("/releases/download/")) return;

  const parts = pathSegment.split("/").filter(Boolean);
  let ref = "HEAD";
  let filePath = "";

  // 2. IMPROVED BRANCH PARSING (Supports slashes like feature/fix)
  const sepIdx = parts.findIndex((p) =>
    ["blob", "raw", "src", "-/raw"].includes(p),
  );
  if (sepIdx !== -1 && parts.length > sepIdx + 2) {
    ref = parts[sepIdx + 1];
    filePath = parts.slice(sepIdx + 2).join("/");
  } else {
    ref = parts.shift() || "HEAD";
    filePath = parts.join("/");
  }

  const startLine = startStr ? parseInt(startStr, 10) : 1;
  const endLine = endStr ? parseInt(endStr, 10) : startLine + 19;

  const rawUrl = RAW_URL_BUILDERS[host]?.(owner, repo, ref, filePath);
  if (!rawUrl) return;

  const code = await fetchCode(rawUrl);
  if (!code) return;

  const lang = detectLanguage(filePath);
  const { snippet, actualStart, actualEnd } = extractSnippet(
    code,
    startLine,
    endLine,
  );
  
  embeds.push(
    createCodeEmbed(
      fullUrl,
      host,
      owner,
      repo,
      ref,
      filePath,
      startLine,
      endLine,
      unindent(snippet),
      lang,
      actualStart,
      actualEnd,
    ),
  );
}

export async function autoPreviewCodeLinks(message: Message): Promise<void> {
  if (!message?.content || message.author?.bot) return;

  const embeds: EmbedBuilder[] = [];
  const processedUrls = new Set<string>();
  const matches = message.content.matchAll(CODE_LINK_REGEX);

  for (const m of matches) {
    const [fullUrl, host, owner, repo, pathSegment, start, end] = m;
    if (!fullUrl || processedUrls.has(fullUrl) || embeds.length >= 3) continue;
    processedUrls.add(fullUrl);

    await processCodeUrl(
      fullUrl,
      host,
      owner,
      repo,
      pathSegment,
      start,
      end,
      embeds,
    );
  }

  if (embeds.length > 0) {
    await message
      .reply({ embeds, allowedMentions: { repliedUser: false } })
      .catch(() => {});
  }
}

export default autoPreviewCodeLinks;