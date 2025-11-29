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
import { default as fetch } from "node-fetch";
import {
  Client,
  GatewayIntentBits,
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

import {
  runPluginSearch,
  getPluginByHash,
  PLUGIN_LIST_URL,
  Plugin,
} from "./commands/utility/plugin";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  DEV_GUILD_ID,
  LOG_WEBHOOK_URL,
  DASHBOARD_PORT,
} = process.env;

// PLUGIN_LIST_URL is now imported from plugin.ts, but kept here for backward compatibility
// with your previous file version. However, it's safer to ensure the import is used:
// const PLUGIN_LIST_URL = "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/refs/heads/main/src/plugins-data.json";

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable. Exiting.");
  process.exit(1);
}

const commands: any[] = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

initWebhookLogger(LOG_WEBHOOK_URL);
attachProcessHandlers();

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
      await client.application?.fetch();
    }
    if (DEV_GUILD_ID) {
      console.log(`Registering commands to guild ${DEV_GUILD_ID}...`);
      const guild = await client.guilds.fetch(DEV_GUILD_ID);
      await guild.commands.set(commands);
      console.log("Commands registered to guild.");
    } else {
      if (!CLIENT_ID) {
        console.warn("CLIENT_ID not provided. Registering global commands.");
      }
      console.log("Registering global application commands...");
      await client.application?.commands.set(commands);
      console.log("Global commands registered.");
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

client.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      await interaction.reply({
        content: "Command not implemented.",
        ephemeral: true,
      });
    } catch (err) {
      console.error("Unhandled chat input command error:", err);
    }
  } else if (interaction.isButton()) {
    // LISTEN FOR "plg_" HERE to match plugin.ts
    if (interaction.customId.startsWith("plg_")) {
      const hash = interaction.customId.replace("plg_", "");

      // Immediately defer to prevent timeout error
      await interaction.deferReply({ ephemeral: true });

      try {
        const response = await fetch(PLUGIN_LIST_URL);
        if (!response.ok) throw new Error("Failed to fetch plugin list");

        const plugins = (await response.json()) as Plugin[];

        // Match the hash to a plugin
        const plugin = getPluginByHash(plugins, hash);

        if (plugin && plugin.installUrl) {
          const embed = new EmbedBuilder()
            .setTitle(`Install ${plugin.name}`)
            .setDescription(plugin.installUrl)
            .setColor(0x00ff00);

          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply({
            content:
              "❌ Could not find the install link. Plugin may have been updated.",
          });
        }
      } catch (err) {
        console.error("Failed to handle plugin button:", err);
        await interaction.editReply({
          content: "Internal error while fetching plugin details.",
        });
      }
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
  if (_initLock) return;
  _initLock = true;

  try {
    if (_cleanupFns.length > 0) {
      for (const fn of _cleanupFns) {
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      }
      _cleanupFns = [];
    }

    const c: any = client;
    console.log(`Logged in as ${c.user?.tag} (id: ${c.user?.id})`);
    await registerCommands();
    console.log("Bot is ready.");

    try {
      const { startDashboard } = await import("./dashboard");
      const dashboardPort = DASHBOARD_PORT
        ? parseInt(DASHBOARD_PORT, 10)
        : 14150;
      startDashboard(dashboardPort, client);
    } catch (err) {
      console.error("Failed to start dashboard:", err);
    }

    // Initialize optional events from the `src/events` barrel (presence, autorole),
    // and initialize prefix-based commands if available.
    // Missing modules or missing exports are handled gracefully.
    try {
      const eventsMod: any = await import("./events");
      const startPresence = eventsMod?.startPresence ?? eventsMod?.default;
      const setupAutoRole = eventsMod?.setupAutoRole ?? eventsMod?.default;

      if (typeof startPresence === "function") {
        const cleanup = await startPresence(client);
        if (typeof cleanup === "function") _cleanupFns.push(cleanup);
      }
      if (typeof setupAutoRole === "function") {
        const cleanup = await setupAutoRole(client);
        if (typeof cleanup === "function") _cleanupFns.push(cleanup);
      }
    } catch (err) {
      console.error("Failed to init events:", err);
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
  // the installed package version at runtime.
  const djsPkg = require("discord.js/package.json");
  const djsMajor = parseInt(String(djsPkg.version).split(".")[0], 10) || 0;
  if (djsMajor >= 15) {
    client.on("clientReady", onClientReady);
  } else {
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

    const messageContentLower = message.content.toLowerCase();

    // Sticky Notes
    if (messageContentLower.startsWith("snote")) {
      const topic = messageContentLower.slice(6).trim();
      if (!topic) {
        const availableNotes = Object.keys(notes)
          .map((n) => `**${n}**`)
          .join(", ");
        const embed = new EmbedBuilder()
          .setTitle("Need a Snote?")
          .setDescription(availableNotes)
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

        const messageIdToReplyTo = message.reference?.messageId;

        if (messageIdToReplyTo) {
          await message.channel.send({
            embeds: [embed],
            reply: { messageReference: messageIdToReplyTo },
          });
        } else {
          await message.channel.send({
            embeds: [embed],
          });
        }
      } else {
        await message.channel.send({
          content: `No sticky note found for "${topic}".`,
        });
      }
      return;
    }

    // Plugin Search
    let pluginQuery = "";
    if (messageContentLower.startsWith("splug ")) {
      pluginQuery = message.content.slice(6).trim();
    } else {
      const match = message.content.match(/^\[\[(.*?)\]\]$/);
      if (match && match[1]) pluginQuery = match[1].trim();
    }

    if (pluginQuery) {
      await runPluginSearch(message, [pluginQuery]);
      return;
    }

    await autoPreviewCodeLinks(message);
    await autoPreviewCommitLinks(message);
  } catch (err) {
    console.error("messageCreate error:", err);
  }
});

/**
 * Login
 */
client.login(DISCORD_TOKEN).catch((err) => {
  console.error("Failed to login:", err);
  process.exit(1);
});
