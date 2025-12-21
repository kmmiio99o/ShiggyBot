import { Client } from "discord.js";
import { commandRegistry } from "./index";
import { config } from "../config";
import { logger } from "../utils/webhookLogger";

/**
 * Initializes and registers slash commands with Discord.
 *
 * Behaviour:
 *  - Loads/ensures all slash commands are registered in the local `commandRegistry`.
 *  - Converts the commands to the JSON shape expected by Discord.
 *  - If `config.devGuildId` is set, registers the commands to that guild (faster for development).
 *    Otherwise registers the commands globally.
 *
 * This function is async and intended to be awaited during the bot's ready initialization.
 */
export async function setupSlashCommands(client: Client): Promise<void> {
  try {
    console.log("🚀 Registering slash commands...");

    // Ensure commands are discovered/loaded into the registry
    await commandRegistry.registerAllCommands();

    const slashCommands = commandRegistry.getAllSlashCommands();
    if (!slashCommands || slashCommands.length === 0) {
      console.log("⚠️ No slash commands found to register.");
      return;
    }

    // Convert registered commands to the shape Discord expects
    const commandsPayload = slashCommands.map((cmd) => {
      // Many builders (SlashCommandBuilder / SlashCommandOptionsOnlyBuilder) have toJSON()
      // If `data` is already a plain object, use it as-is.
      // Use any typing guard at runtime to be tolerant.
      const data: any = (cmd as any).data;
      if (data && typeof data.toJSON === "function") {
        return data.toJSON();
      }
      return data;
    });

    // If a development/guild override is set in config, register to that guild;
    // otherwise perform a global registration.
    if (config.devGuildId) {
      const guild = client.guilds.cache.get(config.devGuildId);
      if (!guild) {
        console.warn(
          `⚠️ Dev guild id (${config.devGuildId}) provided but guild not found in cache. Falling back to global registration.`,
        );
        await client.application?.commands.set(commandsPayload);
      } else {
        await guild.commands.set(commandsPayload);
        console.log(
          `✅ Registered ${commandsPayload.length} slash commands to guild ${config.devGuildId}`,
        );
      }
    } else {
      await client.application?.commands.set(commandsPayload);
      console.log(`✅ Registered ${commandsPayload.length} global slash commands`);
    }

    await logger.info("Slash commands registered", {
      count: commandsPayload.length,
      devGuild: config.devGuildId ?? null,
    });
  } catch (error) {
    console.error("❌ Failed to register slash commands:", error);
    await logger.error(error as Error, { type: "setupSlashCommands" });
    // Do not throw further to avoid taking down the bot during registration failures,
    // but propagate if you want the caller to handle it instead.
  }
}

export default setupSlashCommands;
