/**
 * Entry point for ShiggyBot — a small, extensible Discord bot scaffold in TypeScript.
 *
 * Features included:
 * - Loads configuration from environment variables (via dotenv).
 * - Registers a simple slash command `/getrole` that assigns a configured role to the invoking user.
 * - Demonstrates runtime registration of commands (guild-scoped when `DEV_GUILD_ID` is provided,
 *   otherwise registers globally).
 * - Clean, easy-to-extend structure and clear places to add more commands / handlers.
 *
 * Environment variables expected:
 * - DISCORD_TOKEN      (required) — your bot token
 * - CLIENT_ID          (optional, recommended) — your application's client ID (used for logging)
 * - DEV_GUILD_ID       (optional) — if provided, commands will be registered to this guild (fast dev loop) *
 * Usage:
 * - Install dependencies: `npm install`
 * - Build: `npm run build`
 * - Dev: `npm run dev` (requires ts-node-dev)
 *
 * - Start: set env vars and run `npm start`
 *
 * Extend:
 * - Add more entries to the `commands` array or implement a dynamic command loader.
 * - Add event listeners for `messageCreate`, `guildMemberAdd`, etc.
 */

import dotenv from "dotenv";
dotenv.config();
import http from "http";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Interaction,
  EmbedBuilder,
} from "discord.js";
import {
  initWebhookLogger,
  logInfo,
  logError,
  attachProcessHandlers,
} from "./utils/webhookLogger";
import { autoPreviewCodeLinks } from "./Previews/codePreview";
import { autoPreviewCommitLinks } from "./Previews/commitPreview";
import { startDashboard } from "./dashboard";
import { notes } from "./snotes";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  DEV_GUILD_ID, // optional: for quicker command registration during development
  LOG_WEBHOOK_URL,
  DASHBOARD_PORT,
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable. Exiting.");
  process.exit(1);
}

/**
 * Define commands here. For larger projects you can:
 * - Move commands into separate files under `src/commands` and import them dynamically.
 * - Create both command data and run handlers alongside.
 */
const commands: any[] = [];

/**
 * Create client. Choose intents you need — we include `Guilds` and `GuildMembers`
 * because we will be fetching and modifying member roles.
 *
 * If you plan to use message content (prefix commands) you must enable `MessageContent`
 * in the developer portal and add the intent here (and be aware of privileged intent requirements).
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize webhook logger (if configured) and attach process-level handlers.
// This runs early so unhandled errors during startup are captured.
initWebhookLogger(LOG_WEBHOOK_URL);
attachProcessHandlers();
// Best-effort informational log that logger is initialized.
try {
  logInfo("Webhook logger initialized", {
    env: DEV_GUILD_ID ? "dev" : "prod",
  }).catch(() => {});
} catch {
  // ignore initialization errors
}

/**
 * Register slash commands on startup.
 * If DEV_GUILD_ID is provided the commands are registered to that guild (instant).
 * Otherwise registers globally (can take up to 1 hour to propagate).
 */
async function registerCommands() {
  try {
    if (!client.application?.owner) {
      // Ensure the application is fetched
      await client.application?.fetch();
    }

    if (DEV_GUILD_ID) {
      console.log(`Registering commands to guild ${DEV_GUILD_ID}...`);
      const guild = await client.guilds.fetch(DEV_GUILD_ID);
      await guild.commands.set(commands);
      console.log("Commands registered to guild.");
    } else {
      if (!CLIENT_ID) {
        console.warn(
          "CLIENT_ID not provided. Registering global commands using client.application may still work if the app is linked.",
        );
      }
      console.log("Registering global application commands...");
      await client.application?.commands.set(commands);
      console.log("Global commands registered (may take some time to appear).");
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

/**
 * Interaction handler (slash commands).
 */
client.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // No built-in slash commands in this scaffold by default.
    // Reply with a simple unimplemented message for any chat command.
    await interaction.reply({
      content: "Command not implemented.",
      ephemeral: true,
    });
  } catch (err) {
    console.error("Unhandled interaction error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Internal error while handling command.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "Internal error while handling command.",
      });
    }
  }
});

/**
 * Ready event — bot is connected.
 *
 * Note: different discord.js major versions use different event names for the
 * ready lifecycle. v14 uses `ready`, v15 renamed the high-level event to
 * `clientReady`. To support both versions (and avoid the bot silently not
 * initializing when using v14), attach the same handler to both event names.
 *
 * Guard against duplicate initialization (some environments or discord.js
 * versions may cause the ready handler to fire twice). We set a small module-
 * scoped flag so initialization runs only once.
 */
/**
 * Safe initialization / re-initialization with cleanup support
 *
 * Some environments (hot reloaders, ts-node-dev respawn, or mixed discord.js
 * versions) may cause the ready lifecycle to be emitted more than once.
 * Instead of ignoring subsequent ready events entirely, we support calling
 * any cleanup functions returned by event modules before re-initializing them.
 *
 * Each optional module (presence, autorole, prefix handler) may return a
 * cleanup function when started; we capture those and call them prior to the
 * next initialization to ensure a clean state.
 */
let _cleanupFns: Array<() => void> = [];
let _initLock = false;

const onClientReady = async () => {
  // Prevent concurrent ready initializations which can lead to duplicate
  // listeners being registered (e.g. prefix handler attached twice).
  if (_initLock) {
    console.log(
      "Ready handler invoked while initialization is already in progress; skipping duplicate invocation.",
    );
    return;
  }
  _initLock = true;

  try {
    // If we have any previous cleanup functions, run them first so we can
    // re-initialize modules cleanly (helpful during hot-reload / respawn).
    if (_cleanupFns.length > 0) {
      try {
        console.log(
          `Re-initializing modules: running ${_cleanupFns.length} cleanup function(s).`,
        );
        for (const fn of _cleanupFns) {
          try {
            fn();
          } catch (err) {
            console.error("Module cleanup function threw:", err);
          }
        }
      } finally {
        _cleanupFns = [];
      }
    }

    const c: any = client;
    console.log(`Logged in as ${c.user?.tag} (id: ${c.user?.id})`);
    try {
      await logInfo("Bot ready", {
        user: `${c.user?.tag}`,
        id: `${c.user?.id}`,
      });
    } catch {
      // ignore logging failures
    }
    await registerCommands();
    console.log(
      "Bot is ready. Add more listeners and commands in src/ to extend functionality.",
    );

    // Start dashboard after bot is ready
    try {
      const { startDashboard } = await import("./dashboard");
      const dashboardPort = DASHBOARD_PORT
        ? parseInt(DASHBOARD_PORT, 10)
        : 14150;
      // Pass the running Discord client so the dashboard can access guild/member APIs
      startDashboard(dashboardPort, client);
    } catch (err) {
      console.error("Failed to start dashboard:", err);
    }

    // Initialize optional events from the `src/events` barrel (presence, autorole),
    // and initialize prefix-based commands if available.
    // Missing modules or missing exports are handled gracefully.
    try {
      const eventsMod: any = await import("./events");

      const startPresence =
        eventsMod?.startPresence ??
        eventsMod?.setupPresence ??
        eventsMod?.default ??
        eventsMod;
      const setupAutoRole =
        eventsMod?.setupAutoRole ?? eventsMod?.default ?? eventsMod;

      if (typeof startPresence === "function") {
        try {
          const maybeCleanup = await startPresence(client);
          if (typeof maybeCleanup === "function") {
            _cleanupFns.push(maybeCleanup);
          }
          console.log("Presence module started.");
        } catch (err) {
          console.error("Failed to start presence module:", err);
        }
      }

      if (typeof setupAutoRole === "function") {
        try {
          const maybeCleanup = await setupAutoRole(client);
          if (typeof maybeCleanup === "function") {
            _cleanupFns.push(maybeCleanup);
          }
          console.log("Autorole module initialized.");
        } catch (err) {
          console.error("Failed to initialize autorole handler:", err);
        }
      }

      // Try to load the prefix commands module (src/events/prefixCommands.ts) and start it
      try {
        const prefixMod: any = await import("./events/prefixCommands");
        const setupPrefix =
          prefixMod?.setupPrefixCommands ?? prefixMod?.default ?? prefixMod;
        if (typeof setupPrefix === "function") {
          try {
            // The prefix handler may return a cleanup function (unregister).
            // Capture it so we can call it before re-initialization.
            const cleanup = setupPrefix(client);
            if (typeof cleanup === "function") {
              _cleanupFns.push(cleanup);
            }
            console.log("Prefix commands handler initialized.");
          } catch (err) {
            console.error("Failed to initialize prefix commands handler:", err);
          }
        }
      } catch (err) {
        // It's optional; log at debug level
        console.debug(
          "Prefix commands module not loaded (optional):",
          (err as any)?.message ?? err,
        );
      }
    } catch (err) {
      console.error("Failed to initialize optional events module:", err);
    }
  } finally {
    // Release the initialization lock so subsequent ready events can re-run
    _initLock = false;
  }
};

// Use `on` for ready events to support multiple invocations (we handle cleanup
// and re-initialization inside the handler). Choose the correct event name based
// on the installed discord.js major version to avoid deprecation warnings in v15+.\
try {
  // Read discord.js package.json to determine major version at runtime.
  // If this fails for any reason, prefer the new `clientReady` event to avoid
  // emitting the deprecation warning on modern discord.js installations.
  // This keeps behavior safe across different environments and bundlers.\
  // Note: require is used here because it's a simple, resilient way to read
  // the installed package version at runtime.\
  const djsPkg = require("discord.js/package.json");
  const djsMajor = parseInt(String(djsPkg.version).split(".")[0], 10) || 0;
  if (djsMajor >= 15) {
    client.on("clientReady", onClientReady);
  } else {
    // For older v14 installs, listen to `ready`.\
    client.on("ready", onClientReady as any);
  }
} catch (err) {
  // If we can't determine the version at runtime (packaging, bundlers, etc.),
  // prefer the modern event name to avoid the deprecation warning on v15+.\
  client.on("clientReady", onClientReady);
}

// TEMPORARY: raw messageCreate listener to confirm messages are arriving at the client.
// This will log non-bot messages (guild/DM) with basic metadata. Keep this temporarily for debugging,
// then remove it once you've confirmed events are delivered.
client.on("messageCreate", async (message) => {
  try {
    if (message.author?.bot) return;
    // Log a short preview of the message (truncate content for safety)
    const preview =
      typeof message.content === "string" ? message.content.slice(0, 200) : "";
    console.log(
      `raw: messageCreate from ${
        message.author?.tag ?? message.author?.id ?? "unknown"
      } ` +
        `guild=${message.guild?.id ?? "DM"} channel=${
          message.channel?.id ?? "unknown"
        } ` +
        `content_len=${message.content?.length ?? 0} preview="${preview}"`,
    );

    // Snote sticky note command: Snote <topic>
    const messageContentLower = message.content.toLowerCase();
    if (messageContentLower.startsWith("snote")) {
      const topic = messageContentLower.slice(6).trim();

      if (!topic) {
        // Display available notes in an embed
        const availableNotes = Object.keys(notes)
          .map((note) => `**${note}**`)
          .join(", ");
        const embed = new EmbedBuilder()
          .setTitle("Need a Snote?")
          .setDescription(`${availableNotes}`)
          .setColor(0xffeac4);

        await message.channel.send({ embeds: [embed] });
        return;
      }

      const note = notes[topic];

      if (note) {
        const content = Array.isArray(note.content)
          ? note.content.join("\n")
          : note.content;

        const embed = new EmbedBuilder()
          .setTitle(note.title)
          .setDescription(content)
          .setColor(0xffeac4);

        if (message.reference?.messageId) {
          await message.channel.send({
            embeds: [embed],
            reply: { messageReference: message.reference.messageId },
            allowedMentions: { repliedUser: true },
          });
        } else {
          await message.channel.send({
            embeds: [embed],
          });
        }
      } else {
        await message.channel.send({
          content: `No sticky note found for "${topic}".`,
          allowedMentions: { repliedUser: false },
        });
      }
      return;
    }

    // Automatically preview code links in any message
    await autoPreviewCodeLinks(message);
    // Automatically preview commit links in any message
    await autoPreviewCommitLinks(message);
  } catch (err) {
    console.error("raw messageCreate logger error:", err);
  }
});

/**
 * Login
 */
client.login(DISCORD_TOKEN).catch(async (err) => {
  console.error("Failed to login:", err);
  try {
    await logError(err, { stage: "login" });
  } catch {
    // ignore logger errors
  }
  process.exit(1);
});

/**
 * Helpful notes for extension:
 * - To add more commands, create structured command modules (command data + execute function)
 *   and load them dynamically into `commands` at runtime.
 * - Consider adding a simple command loader that reads `src/commands/*.ts`.
 * - For persistent state (who requested roles, settings per-guild), integrate a small DB
 *   (SQLite, JSON file, or a hosted DB). Keep secrets in environment variables.
 * - Add better error handling and logging (Sentry, pino, winston).
 */
