import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
} from "discord.js";
import { default as fetch } from "node-fetch";
import { createHash } from "crypto";

// EXPORTED interface
export interface Plugin {
  name: string;
  description: string;
  authors: string[];
  status: string;
  sourceUrl: string;
  installUrl: string;
  warningMessage: string;
}

// EXPORTED URL
export const PLUGIN_LIST_URL =
  "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/refs/heads/main/src/plugins-data.json";

// Status colors
const STATUS_COLORS = {
  working: 0x00ff00,
  warning: 0xffff00,
  broken: 0xff0000,
  default: 0xffcc00,
} as const;

// Status emojis
const STATUS_EMOJIS = {
  working: "🟢",
  warning: "🟡",
  broken: "🔴",
  default: "⚪",
} as const;

async function safeReply(message: Message, content: string) {
  const embed = new EmbedBuilder()
    .setTitle("ShiggyBot")
    .setDescription(content)
    .setColor(STATUS_COLORS.default)
    .setTimestamp();

  try {
    await message.reply({ embeds: [embed] });
  } catch (err) {
    try {
      if (
        message.author &&
        typeof (message.author as any).send === "function"
      ) {
        await (message.author as any).send({ embeds: [embed as any] });
      } else {
        await (message.channel as any).send({ embeds: [embed as any] });
      }
    } catch (err2) {
      console.error(
        "safeReply: failed to deliver embed reply:",
        (err2 as any)?.message ?? String(err2),
      );
    }
  }
}

async function fetchPluginData(): Promise<Plugin[]> {
  try {
    const response = await fetch(PLUGIN_LIST_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as Plugin[];
  } catch (error) {
    console.error("Failed to fetch plugin data:", error);
    return [];
  }
}

function calculateSimilarity(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match (case-insensitive) - highest priority
  if (lowerText === lowerQuery) return 10.0;

  // Exact match with spaces removed (e.g., "anti ed" matches "antied")
  const textNoSpaces = lowerText.replace(/\s+/g, "");
  const queryNoSpaces = lowerQuery.replace(/\s+/g, "");
  if (textNoSpaces === queryNoSpaces) return 9.5;

  // Starts with query - very high priority
  if (lowerText.startsWith(lowerQuery)) return 9.0;

  // Query is at word boundary (e.g., "pet" matches "petPet" start)
  const escapedQuery = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundaryMatch = lowerText.match(
    new RegExp(`\\b${escapedQuery}`, "i"),
  );

  if (wordBoundaryMatch) return 8.5;

  // Contains query as substring
  if (lowerText.includes(lowerQuery)) {
    // Bonus for being closer to the start
    const position = lowerText.indexOf(lowerQuery);
    const positionBonus = 1 - (position / lowerText.length) * 0.3;
    // Bonus for length similarity
    const lengthRatio = lowerQuery.length / lowerText.length;
    return 7.0 + positionBonus + lengthRatio;
  }

  // Levenshtein distance for fuzzy matching - only for close matches
  const distance = levenshteinDistance(lowerText, lowerQuery);
  const maxLength = Math.max(lowerText.length, lowerQuery.length);

  if (maxLength === 0) return 10.0;

  // Only accept if the edit distance is small relative to query length
  const similarity = 1 - distance / maxLength;

  // Require higher similarity for fuzzy matches
  if (similarity < 0.6) return 0; // Reject poor matches

  return similarity * 5.0; // Scale down fuzzy matches (max 5.0)
}

function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;

  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = Array(an + 1)
    .fill(null)
    .map(() => Array(bn + 1).fill(0));

  for (let i = 0; i <= an; i++) matrix[i][0] = i;
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[an][bn];
}

function getStatusColor(status: string): number {
  const normalized = status.toLowerCase();
  return (
    STATUS_COLORS[normalized as keyof typeof STATUS_COLORS] ??
    STATUS_COLORS.default
  );
}

function getStatusEmoji(status: string): string {
  const normalized = status.toLowerCase();
  return (
    STATUS_EMOJIS[normalized as keyof typeof STATUS_EMOJIS] ??
    STATUS_EMOJIS.default
  );
}

function generatePluginHash(pluginName: string): string {
  // Create a short hash from the plugin name (max 50 chars to stay under 100 limit)
  return createHash("md5").update(pluginName).digest("hex").substring(0, 16);
}

function createPluginButtons(
  plugin: Plugin,
  shortLabel: boolean = false,
): ActionRowBuilder<ButtonBuilder> | null {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (plugin.installUrl) {
    const pluginHash = generatePluginHash(plugin.name);

    row.addComponents(
      new ButtonBuilder()
        .setLabel(
          shortLabel ? plugin.name.substring(0, 80) : "Copy Install Link",
        )
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`plg_${pluginHash}`),
    );
  }

  if (plugin.sourceUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Source Code")
        .setStyle(ButtonStyle.Link)
        .setURL(plugin.sourceUrl),
    );
  }

  return row.components.length > 0 ? row : null;
}

async function showSinglePlugin(
  message: Message,
  plugin: Plugin,
  loadingMessage: Message,
) {
  const embed = new EmbedBuilder()
    .setTitle(`Plugin: ${plugin.name}`)
    .setDescription(
      plugin.description.length > 200
        ? plugin.description.substring(0, 197) + "..."
        : plugin.description,
    )
    .addFields(
      {
        name: "Authors",
        value: plugin.authors.join(", ") || "N/A",
        inline: true,
      },
      {
        name: "Status",
        value: `${getStatusEmoji(plugin.status)} ${plugin.status}`,
        inline: true,
      },
    )
    .setColor(getStatusColor(plugin.status))
    .setTimestamp();

  if (plugin.warningMessage) {
    embed.addFields({
      name: "⚠️ Warning",
      value: plugin.warningMessage,
      inline: false,
    });
  }

  const buttonRow = createPluginButtons(plugin);

  try {
    await loadingMessage.edit({
      embeds: [embed],
      components: buttonRow ? [buttonRow] : [],
    });
  } catch (err) {
    console.error("Failed to edit message with plugin info:", err);
  }
}

async function showMultiplePlugins(
  message: Message,
  query: string,
  results: Array<{ plugin: Plugin; score: number }>,
  loadingMessage: Message,
) {
  const embed = new EmbedBuilder()
    .setTitle("Plugin Search Results")
    .setDescription(
      `Found ${results.length} plugin${results.length === 1 ? "" : "s"} matching **${query}**`,
    )
    .setColor(STATUS_COLORS.default)
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  const maxResults = 5;

  results.slice(0, maxResults).forEach((item, index) => {
    const plugin = item.plugin;
    const emoji = getStatusEmoji(plugin.status);
    const truncatedDesc =
      plugin.description.length > 100
        ? plugin.description.substring(0, 97) + "..."
        : plugin.description;

    embed.addFields({
      name: `${index + 1}. ${emoji} ${plugin.name}`,
      value: `*${truncatedDesc}*\n**Authors:** ${plugin.authors.join(", ") || "N/A"}`,
      inline: false,
    });

    const buttonRow = createPluginButtons(plugin, true);
    if (buttonRow) {
      components.push(buttonRow);
    }
  });

  if (results.length > maxResults) {
    embed.setFooter({
      text: `Showing top ${maxResults} of ${results.length} results. Refine your search for better matches.`,
    });
  }

  try {
    await loadingMessage.edit({
      embeds: [embed],
      components: components.length > 0 ? components : [],
    });
  } catch (err) {
    console.error("Failed to edit message with search results:", err);
  }
}

export async function handlePluginSearch(
  message: Message,
  args: string[],
): Promise<void> {
  const query = args.join(" ").trim();

  if (!query) {
    await safeReply(
      message,
      "Please provide a plugin name to search for.\n**Usage:** `Splug <plugin name>`\n**Example:** `Splug petPet`",
    );
    return;
  }

  // Show loading message
  const loadingEmbed = new EmbedBuilder()
    .setTitle("ShiggyBot")
    .setDescription("🔍 Searching for plugins...")
    .setColor(STATUS_COLORS.default)
    .setTimestamp();

  let loadingMessage: Message;
  try {
    loadingMessage = await message.reply({ embeds: [loadingEmbed] });
  } catch (err) {
    console.error("Failed to send loading message:", err);
    return;
  }

  // Fetch plugin data
  const allPlugins = await fetchPluginData();

  if (allPlugins.length === 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("ShiggyBot")
      .setDescription("❌ Failed to fetch plugin data. Please try again later.")
      .setColor(STATUS_COLORS.broken)
      .setTimestamp();

    try {
      await loadingMessage.edit({ embeds: [errorEmbed] });
    } catch (err) {
      console.error("Failed to update loading message with error:", err);
    }
    return;
  }

  // Search and score plugins
  const scoreThreshold = 6.0; // Higher threshold for better quality results
  const searchResults = allPlugins
    .map((plugin) => ({
      plugin,
      score: calculateSimilarity(plugin.name, query),
    }))
    .filter((item) => item.score >= scoreThreshold)
    .sort((a, b) => b.score - a.score);

  // Display results
  if (searchResults.length === 0) {
    const noResultsEmbed = new EmbedBuilder()
      .setTitle("ShiggyBot")
      .setDescription(
        `No plugins found matching **${query}**.\n\nTry a different search term or check your spelling.`,
      )
      .setColor(STATUS_COLORS.default)
      .setTimestamp();

    try {
      await loadingMessage.edit({ embeds: [noResultsEmbed] });
    } catch (err) {
      console.error("Failed to update loading message with no results:", err);
    }
    return;
  }

  if (searchResults.length === 1) {
    await showSinglePlugin(message, searchResults[0].plugin, loadingMessage);
  } else {
    await showMultiplePlugins(message, query, searchResults, loadingMessage);
  }
}

// EXPORTED helper function for button handler
export function getPluginByHash(
  plugins: Plugin[],
  hash: string,
): Plugin | null {
  return plugins.find((p) => generatePluginHash(p.name) === hash) || null;
}

// Handle button interactions for plugin install links
export async function handlePluginButton(
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  if (customId.startsWith("plg_")) {
    await interaction.deferReply({ ephemeral: true });
    const pluginHash = customId.substring(4); // Remove "plg_" prefix

    const allPlugins = await fetchPluginData();
    const plugin = getPluginByHash(allPlugins, pluginHash);

    if (plugin && plugin.installUrl) {
      await interaction.editReply({
        content: `Here's the install link for **${plugin.name}**:\n\`\`\`${plugin.installUrl}\`\`\`\n**Note:** If the link doesn't work directly, you might need to copy and paste it into your client's plugin installer.`,
      });
    } else {
      await interaction.editReply({
        content: "❌ Could not find the plugin or its install link.",
      });
    }
  }
}
