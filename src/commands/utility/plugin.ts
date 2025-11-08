import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { default as fetch } from "node-fetch";

interface Plugin {
  name: string;
  description: string;
  authors: string[];
  status: string;
  sourceUrl: string;
  installUrl: string;
  warningMessage: string;
}

const PLUGIN_LIST_URL =
  "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/refs/heads/main/src/plugins-data.json";

// Define colors for embed status
const COLOR_WORKING = 0x00ff00; // Green
const COLOR_WARNING = 0xffff00; // Yellow
const COLOR_BROKEN = 0xff0000; // Red
const COLOR_INFO = 0x0099ff; // Blue for general info/usage/no results

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

/**
 * Calculates the Levenshtein distance between two strings.
 * Used to determine the similarity between a query and a plugin name.
 * @param a The first string.
 * @param b The second string.
 * @returns The Levenshtein distance.
 */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;

  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];

  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 1; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[an][bn];
}

/**
 * Fuzzy matches a text against a query, returning a score from 0 to 1.
 * Higher score means better match.
 * @param text The text to search within (e.g., plugin name).
 * @param query The search query.
 * @returns A score indicating similarity.
 */
function fuzzyMatch(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // If there's an exact substring match, it's a very good score
  if (lowerText.includes(lowerQuery)) {
    // Prioritize exact matches or strong partials
    return 1.0 - (lowerText.length - lowerQuery.length) / lowerText.length;
  }

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(lowerText, lowerQuery);

  // Normalize distance to a similarity score (0 to 1)
  // Max possible distance is the length of the longer string
  const maxLength = Math.max(lowerText.length, lowerQuery.length);
  if (maxLength === 0) return 1; // Both empty strings are a perfect match

  // A perfect match (distance 0) should yield score 1.
  // A completely dissimilar match should yield a score close to 0.
  // We'll use a threshold to filter out very poor matches later if needed.
  return 1 - distance / maxLength;
}

async function sendEmbedReply(
  message: Message,
  embed: EmbedBuilder,
  components: ActionRowBuilder<ButtonBuilder>[] = [],
): Promise<Message> {
  try {
    return await message.reply({
      embeds: [embed],
      components,
    });
  } catch (replyErr) {
    console.error(
      "Failed to reply to message, attempting DM/channel send:",
      replyErr,
    );
    try {
      // message.reply() does not support ephemeral. Fallback to DM or channel send.
      // If message.reply() failed, it's likely a permission issue in the channel,
      // so we try DMing the author if available.

      if (
        message.author &&
        typeof (message.author as any).send === "function"
      ) {
        return await (message.author as any).send({
          embeds: [embed as any],
          components: components as any,
        });
      } else {
        return await (message.channel as any).send({
          embeds: [embed as any],
          components: components as any,
        });
      }
    } catch (dmOrChannelErr) {
      console.error(
        "Failed to send DM or channel embed as fallback:",
        dmOrChannelErr,
      );
      throw new Error("Failed to send message after multiple attempts.");
    }
  }
}

export async function runPluginSearch(
  message: Message,
  args: string[],
  page: number = 1,
  filter: string = "all",
): Promise<void> {
  const query = args.join(" ").trim();

  if (!query) {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — Usage")
      .setDescription(
        "Please provide a plugin name to search for. For example: `Splug petPet` or `[[petPet]]`.",
      )
      .setColor(COLOR_INFO); // Use INFO color for usage
    await sendEmbedReply(message, embed); // ephemeral set to true for usage message
    return;
  }

  // Send an initial \"Searching...\" message
  const loadingEmbed = new EmbedBuilder()
    .setDescription("Searching for plugins...")
    .setColor(COLOR_INFO);
  const loadingMessage = await message.reply({
    embeds: [loadingEmbed],
  });

  const allPlugins = await fetchPluginData();

  if (allPlugins.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — Error")
      .setDescription("Failed to fetch plugin data. Please try again later.")
      .setColor(COLOR_BROKEN); // Use BROKEN color for errors
    await sendEmbedReply(message, embed); // ephemeral set to true for usage message
    return;
  }

  const scoreThreshold = 0.4; // Only include matches with a similarity score above this threshold

  const searchResults = allPlugins
    .map((plugin) => ({
      plugin,
      score: fuzzyMatch(plugin.name, query),
    }))
    .filter((item) => item.score >= scoreThreshold) // Filter based on the new similarity score
    .sort((a, b) => b.score - a.score); // Sort by highest score first

  if (searchResults.length > 0) {
    // If only one match, show detailed info and buttons
    if (searchResults.length === 1) {
      const bestMatch = searchResults[0].plugin;

      let embedColor = COLOR_INFO; // Default color
      switch (bestMatch.status.toLowerCase()) {
        case "working":
          embedColor = COLOR_WORKING;
          break;
        case "warning":
          embedColor = COLOR_WARNING;
          break;
        case "broken":
          embedColor = COLOR_BROKEN;
          break;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Plugin: ${bestMatch.name}`)
        .setDescription(
          bestMatch.description.length > 200
            ? bestMatch.description.substring(0, 197) + "..."
            : bestMatch.description,
        )
        .addFields(
          {
            name: "Authors",
            value: bestMatch.authors.join(", ") || "N/A",
            inline: true,
          },
          { name: "Status", value: bestMatch.status, inline: true },
        )
        .setColor(embedColor);

      if (bestMatch.warningMessage) {
        embed.addFields({
          name: "Warning",
          value: bestMatch.warningMessage,
          inline: false,
        });
      }

      const buttonsRow = new ActionRowBuilder<ButtonBuilder>();
      if (bestMatch.installUrl) {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setLabel("Copy Install Link")
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`plugin_install_${bestMatch.installUrl}`),
        );
      }
      if (bestMatch.sourceUrl) {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setLabel("Source Code")
            .setStyle(ButtonStyle.Link)
            .setURL(bestMatch.sourceUrl),
        );
      }

      await loadingMessage.edit({
        // Use edit on loadingMessage
        embeds: [embed],
        components: buttonsRow.components.length > 0 ? [buttonsRow] : [],
      });
    } else {
      // Multiple matches, show a list of top results
      const embed = new EmbedBuilder()
        .setTitle(`Plugin Search Results for "${query}"`)
        .setDescription("Here are the top matching plugins:")
        .setColor(COLOR_INFO);

      const maxResults = 5; // Display up to 5 results
      searchResults.slice(0, maxResults).forEach((item, index) => {
        const plugin = item.plugin;
        let statusEmoji = "⚪"; // White circle for unknown status
        switch (plugin.status.toLowerCase()) {
          case "working":
            statusEmoji = "🟢"; // Green circle
            break;
          case "warning":
            statusEmoji = "🟡"; // Yellow circle
            break;
          case "broken":
            statusEmoji = "🔴"; // Red circle
            break;
        }
        embed.addFields({
          name: `${index + 1}. ${statusEmoji} ${plugin.name}`,
          value: `*${plugin.description.length > 100 ? plugin.description.substring(0, 97) + "..." : plugin.description}*`,
          inline: false,
        });
      });

      await loadingMessage.edit({ embeds: [embed] }); // Use edit on loadingMessage
    }
  } else {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — No Results")
      .setDescription(`No plugins found matching "${query}".`)
      .setColor(COLOR_INFO); // Use INFO color for no results
    await loadingMessage.edit({ embeds: [embed] }); // Use edit on loadingMessage
  }
}
