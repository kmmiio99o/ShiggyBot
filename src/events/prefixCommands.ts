import { Client, Message, EmbedBuilder } from "discord.js";

/**
 * Prefix command loader
 *
 * This module delegates prefix commands (prefixed with `S`) to modular handlers
 * located under `src/commands/...`. It performs minimal parsing and dynamic
 * imports the appropriate command module on demand.
 *
 * Commands:
 *  - Sban <user> [reason]            -> ./commands/moderation/ban.ts (default export)
 *  - Stimeout <user> <duration> ... -> ./commands/moderation/timeout.ts (default export)
 *  - Saddrole <user> <role>         -> ./commands/moderation/addrole.ts (default export)
 *  - Sremoverole <user> <role>      -> ./commands/moderation/addrole.ts (named export runRemoveRole)
 *  - Sabout                          -> handled inline (simple embed)
 *
 * Using dynamic imports keeps the loader small and allows adding/removing
 * commands without touching the loader code.
 */

const PREFIX = process.env.PREFIX?.trim() || "S";

// Module-scoped flag to avoid attaching the messageCreate handler more than once.
// The index ready logic may re-initialize modules during hot-reload or when both
// `ready` and `clientReady` fire; this guard prevents duplicate listeners.
let _prefixHandlerAttached = false;

export function setupPrefixCommands(client: Client): () => void {
  // Attach log so we know the handler was wired
  console.log(
    "prefix loader: attaching messageCreate handler (prefix=",
    PREFIX,
    ")",
  );

  // If already attached, avoid registering a second handler.
  if (_prefixHandlerAttached) {
    console.log(
      "prefix loader: handler already attached; skipping duplicate registration.",
    );
    // Return a no-op cleanup to satisfy the caller contract.
    return () => {};
  }

  const handler = async (message: Message) => {
    try {
      // Trace incoming messages for prefix handling (always log)
      try {
        console.log(
          `prefix: message from ${
            message.author?.tag ?? message.author?.id ?? "unknown"
          } ` +
            `in guild ${message.guild?.id ?? "DM"} content_len=${
              message.content?.length ?? 0
            }`,
        );
      } catch {
        // ignore failures in message inspection
      }

      if (message.author?.bot) {
        console.log("prefix: ignoring message from bot user");
        return;
      }
      if (!message.guild || !message.content) {
        console.log(
          "prefix: missing guild or content; message content may be unavailable (Message Content intent required)",
        );
        return;
      }

      if (
        message.content.slice(0, PREFIX.length).toLowerCase() !==
        PREFIX.toLowerCase()
      ) {
        console.log("prefix: message does not start with prefix");
        return;
      }

      const body = message.content.slice(PREFIX.length).trim();
      if (!body) {
        console.log("prefix: no body after prefix");
        return;
      }

      const parts = body.split(/\s+/);
      const cmd = (parts.shift() || "").toLowerCase();
      const args = parts;

      // Helper reply (robust): accept either a string or a message payload object,
      // then try message.reply, channel.send, and finally DM as fallbacks.
      const reply = async (
        strOrPayload: string | { content?: string; embeds?: any[] },
      ) => {
        const payload =
          typeof strOrPayload === "string"
            ? { content: strOrPayload }
            : strOrPayload;
        // Prefer contextual reply
        try {
          await message.reply(payload as any);
          return;
        } catch {
          // ignore and try channel send
        }

        // Fallback to sending in the channel directly
        try {
          await (message.channel as any).send(payload as any);
          return;
        } catch {
          // ignore and try DM
        }

        // Final fallback: DM the invoking user
        try {
          await message.author.send(payload as any);
          return;
        } catch {
          // give up quietly
        }
      };

      // Delegate to modular commands via dynamic import
      try {
        if (cmd === "ban") {
          console.log("prefix handler: dispatching ban command, args:", args);
          const mod = await import("../commands/moderation/ban");
          const run = mod.default;
          if (typeof run === "function") {
            await run(message, args);
          } else {
            await reply("Ban command not available.");
          }
          return;
        }

        if (cmd === "timeout") {
          console.log(
            "prefix handler: dispatching timeout command, args:",
            args,
          );
          const mod = await import("../commands/moderation/timeout");
          const run = mod.default;
          if (typeof run === "function") {
            await run(message, args);
          } else {
            await reply("Timeout command not available.");
          }
          return;
        }

        if (cmd === "addrole") {
          console.log(
            "prefix handler: dispatching addrole command, args:",
            args,
          );
          const mod = await import("../commands/moderation/addrole");
          const run = mod.default;
          if (typeof run === "function") {
            await run(message, args);
          } else {
            await reply("Add role command not available.");
          }
          return;
        }

        if (cmd === "purge") {
          console.log("prefix handler: dispatching purge command, args:", args);
          const mod: any = await import("../commands/moderation/purge");
          const run = mod.default;
          if (typeof run === "function") {
            await run(message, args);
          } else {
            await reply("Purge command not available.");
          }
          return;
        }

        if (cmd === "removerole") {
          console.log(
            "prefix handler: dispatching removerole command, args:",
            args,
          );
          // standalone removerole module (moved out of addrole)
          const mod: any = await import("../commands/moderation/removerole");
          const run = mod.default ?? mod.runRemoveRole ?? mod.removeRole;
          if (typeof run === "function") {
            await run(message, args);
          } else {
            await reply("Remove role command not available.");
          }
          return;
        }

        if (cmd === "about") {
          const embed = new EmbedBuilder()
            .setTitle("ShiggyBot")
            .setDescription(
              "Lightweight Discord bot scaffold — autorole, presence, prefix commands, and more.",
            )
            .addFields(
              {
                name: "Prefix",
                value: `\`${PREFIX}\` (example: \`${PREFIX}ban @user\`)`,
                inline: true,
              },
              {
                name: "Commands",
                value: `${PREFIX}ban, ${PREFIX}timeout, ${PREFIX}addrole, ${PREFIX}removerole, ${PREFIX}about, ${PREFIX}note`,
                inline: true,
              },
            )
            .setTimestamp();
          await (message.channel as any)
            .send({ embeds: [embed] })
            .catch(() => null);
          return;
        }

        // Unknown command - log for debugging and silently ignore to avoid spam
        console.log(
          `prefix: unknown command '${cmd}' from ${
            message.author?.tag ?? message.author?.id
          }`,
        );
        return;
      } catch (err) {
        console.error(
          "prefix loader: failed to load/execute command module:",
          err,
        );
        await reply("An error occurred while executing the command.");
      }
    } catch (err) {
      console.error("prefix command handler unexpected error:", err);
    }
  };

  client.on("messageCreate", handler);
  _prefixHandlerAttached = true;

  return () => {
    if (_prefixHandlerAttached) {
      client.off("messageCreate", handler);
      _prefixHandlerAttached = false;
    }
  };
}

export default setupPrefixCommands;
