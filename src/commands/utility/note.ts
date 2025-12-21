import { Message } from "discord.js";
import { PrefixCommand } from "../../commands/types";
import { handleSnoteCommand } from "../../features/snotes";

/**
 * Prefix command wrapper for the snotes feature.
 *
 * Usage:
 *  Snote <subcommand...>
 *
 * The actual behaviour is implemented in `src/features/snotes.ts`.
 * This command simply forwards the message to that handler so users can
 * invoke the notes functionality via the bot prefix.
 */
const noteCommand: PrefixCommand = {
  name: "note",
  aliases: ["note"],
  description:
    "Notes utility — create, view or manage short notes (delegates to snotes).",
  usage: "<subcommand> [args]",
  async execute(message: Message, args: string[]) {
    try {
      // Delegate to the snotes feature which expects the full Message object.
      await handleSnoteCommand(message);
    } catch (error) {
      console.error("❌ Error executing note command:", error);
      await message
        .reply("❌ An error occurred while handling the note command.")
        .catch(() => {});
    }
  },
};

export default noteCommand;
