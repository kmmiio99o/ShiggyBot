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

function fuzzyMatch(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText.includes(lowerQuery)) {
    return 1; // Exact substring match
  }

  let score = 0;
  let queryIdx = 0;
  for (let i = 0; i < lowerText.length; i++) {
    if (lowerText[i] === lowerQuery[queryIdx]) {
      queryIdx++;
      score++;
    }
  }

  return queryIdx === lowerQuery.length ? score / lowerText.length : 0;
}

async function sendEmbedReply(
  message: Message,
  embed: EmbedBuilder,
  components: ActionRowBuilder<ButtonBuilder>[] = [],
): Promise<void> {
  try {
    await message.reply({ embeds: [embed], components });
  } catch (err) {
    console.error("Failed to send embed reply:", err);
    try {
      if (
        message.author &&
        typeof (message.author as any).send === "function"
      ) {
        await (message.author as any).send({
          embeds: [embed as any],
          components: components as any,
        });
      } else {
        await (message.channel as any).send({
          embeds: [embed as any],
          components: components as any,
        });
      }
    } catch (dmErr) {
      console.error("Failed to send DM embed or channel embed:", dmErr);
    }
  }
}

export async function runPluginSearch(
  message: Message,
  args: string[],
): Promise<void> {
  const query = args.join(" ").trim();

  if (!query) {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — Usage")
      .setDescription(
        "Please provide a plugin name to search for. For example: `Splug petPet` or `[[petPet]]`.",
      )
      .setColor(COLOR_INFO); // Use INFO color for usage
    await sendEmbedReply(message, embed);
    return;
  }

  const allPlugins = await fetchPluginData();

  if (allPlugins.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — Error")
      .setDescription("Failed to fetch plugin data. Please try again later.")
      .setColor(COLOR_BROKEN); // Use BROKEN color for errors
    await sendEmbedReply(message, embed);
    return;
  }

  const searchResults = allPlugins
    .map((plugin) => ({
      plugin,
      score: fuzzyMatch(plugin.name, query),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

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
            .setLabel("Source Code") // Changed label for conciseness
            .setStyle(ButtonStyle.Link)
            .setURL(bestMatch.sourceUrl),
        );
      }

      await sendEmbedReply(
        message,
        embed,
        buttonsRow.components.length > 0 ? [buttonsRow] : [],
      );
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

      await sendEmbedReply(message, embed);
    }
  } else {
    const embed = new EmbedBuilder()
      .setTitle("Plugin Search — No Results")
      .setDescription(`No plugins found matching "${query}".`)
      .setColor(COLOR_INFO); // Use INFO color for no results
    await sendEmbedReply(message, embed);
  }
}
