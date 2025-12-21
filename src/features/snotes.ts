import { Message, EmbedBuilder } from "discord.js";

/**
 * Structure used by sticky notes.
 */
export interface Snote {
  title: string;
  content: string | string[];
}

/**
 * Hardcoded notes.
 * You can later move this object to a JSON file and load it dynamically if desired.
 */
export const notes: { [key: string]: Snote } = {
  vc: {
    title: "No one can hear me",
    content:
      "Disable **Advanced Voice Activity** in Voice settings of Discord, and reload the app.",
  },
  install: {
    title: "Installation links",
    content: [
      "ShiggyCord: https://github.com/kmmiio99o/ShiggyCord",
      "ShiggyManager: https://github.com/kmmiio99o/ShiggyManager",
      "ShiggyXposed: https://github.com/kmmiio99o/ShiggyXposed",
    ],
  },
  background: {
    title: "Background in themes not showing",
    content:
      "Due to a recent Discord change, the themes chat background is currently broken for some users. The devs want to fix it but haven't been able to recreate the problem themselves yet.",
  },
  ios: {
    title: "iOS Support",
    content:
      "Does ShiggyCord support iOS? No, but you can run it as a custom bundle by [KettuTweak](https://github.com/C0C0B01/KettuTweak).",
  },
  passkeys: {
    title: "Passkeys not working",
    content:
      "Due to the way ShiggyCord modifies the Discord app, it breaks the functionality of passkeys. To use passkeys, you must instead use ShiggyXposed, which doesn't alter the original app. Please note that ShiggyXposed requires a rooted device.",
  },
  ftf: {
    title: "Failed to fetch",
    content:
      "ShiggyCord tried to fetch bundle but couldn't. Try using vpn and see if it works. But if Shiggy still load successfully, ignore it.",
  },
};

/**
 * Handle Snote / note requests.
 *
 * Usage examples:
 *  - `snote` or `note` -> lists available note keys
 *  - `snote list` -> same as above
 *  - `snote vc` -> shows the note with key 'vc'
 *
 * The handler reads the message content and expects the first token to be the
 * command (e.g. `snote`) and the second token (if present) to be the note key.
 */
export async function handleSnoteCommand(message: Message): Promise<void> {
  const tokens = message.content.trim().split(/\s+/).slice(1);
  const key = tokens[0]?.toLowerCase();

  try {
    if (!key || key === "list" || key === "all") {
      // List available notes
      const embed = new EmbedBuilder()
        .setTitle("Snotes — Available Notes")
        .setColor(0x6f42c1)
        .setDescription(
          "Use `snote <key>` to view a note. Example: `snote vc`",
        );

      const names = Object.keys(notes).join(", ");
      embed.addFields({
        name: `Notes (${Object.keys(notes).length})`,
        value: `**${names}**`,
        inline: false,
      });

      await message.reply({ embeds: [embed] }).catch(() => {});
      return;
    }

    const note = notes[key];
    if (!note) {
      await message
        .reply(
          `❌ Unknown note: \`${key}\`. Use \`snote\` to list available notes.`,
        )
        .catch(() => {});
      return;
    }

    // Build embed for the note
    const embed = new EmbedBuilder().setTitle(note.title).setColor(0x2b90d9);

    if (Array.isArray(note.content)) {
      // Show array contents as plain description (remove per-line fields)
      embed.setDescription(note.content.join("\n"));
    } else {
      embed.setDescription(note.content);
    }

    await message.reply({ embeds: [embed] }).catch(() => {});
  } catch (error) {
    console.error("Failed to handle snote command:", error);
    try {
      await message
        .reply("❌ An error occurred while processing the note request.")
        .catch(() => {});
    } catch {
      // ignore
    }
  }
}
