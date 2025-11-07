import { Message, EmbedBuilder } from "discord.js";
import path from "path";
import fs from "fs";

/**
 * Handles the Snote command by dynamically loading a note file and replying with an embed.
 * Usage: Snote <topic>
 */
export async function handleSnote(message: Message, topic: string) {
  // Sanitize topic to prevent path traversal
  const safeTopic = topic.replace(/[^a-z0-9_\-]/gi, "").toLowerCase();
  const notePath = path.join(__dirname, `${safeTopic}.ts`);

  // Check if the note file exists
  if (!fs.existsSync(notePath)) {
    await message.reply({
      content: `No sticky note found for "${topic}".`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  try {
    // Dynamic import for the note file
    const note = await import(`./${safeTopic}.ts`).then((mod) => mod.default);

    const embed = new EmbedBuilder()
      .setTitle(note.title || topic)
      .setDescription(note.content)
      .setColor(0xffeac4);

    await message.reply({ embeds: [embed] });
  } catch (err) {
    await message.reply({
      content: `Error loading sticky note for "${topic}".`,
      allowedMentions: { repliedUser: false },
    });
  }
}
