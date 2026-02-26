import { Client, REST, Routes } from "discord.js";
import { logger } from "../../utils/webhookLogger";
import { setupPrefixCommands } from "../../commands/prefix";
import { commandRegistry } from "../../commands/index";
import { config } from "../../config/index";

let isInitialized = false;
const cleanupFunctions: Array<() => void> = [];

/**
 * Handles the 'ready' event when bot successfully connects to Discord
 */
export function setupReadyHandler(client: Client): () => void {
  const handleReady = async () => {
    if (isInitialized) return;
    isInitialized = true;

    console.log(`Logged in as ${client.user?.tag} (${client.user?.id})`);

    try {
      // Initialize all bot features
      await initializeFeatures(client);

      // Log successful startup
      await logger.info("Bot started successfully", {
        guilds: client.guilds.cache.size,
        user: client.user?.tag,
      });
    } catch (error) {
      console.error("Error during initialization:", error);
      await logger.error(error as Error, { type: "initialization" });
    }
  };

  client.on("clientReady", handleReady);

  return () => {
    client.off("clientReady", handleReady);
  };
}

/**
 * Initializes all bot features and services
 */
async function initializeFeatures(client: Client) {
  try {
    console.log("Initializing bot features...");

    // Initialize autorole feature
    try {
      const autoroleModule = await import("../../features/autorole");
      const setupAutoRole =
        autoroleModule.setup || autoroleModule.default?.setup;
      if (typeof setupAutoRole === "function") {
        // Support both synchronous cleanup return (function) and asynchronous (Promise<function>)
        try {
          const maybeCleanup = setupAutoRole(client) as unknown;
          if (maybeCleanup != null) {
            // Detect promise-like return
            if (typeof (maybeCleanup as any).then === "function") {
              const cleanup = await (maybeCleanup as Promise<
                (() => void) | null | undefined
              >);
              if (typeof cleanup === "function") cleanupFunctions.push(cleanup);
            } else if (typeof maybeCleanup === "function") {
              // Synchronous cleanup function
              cleanupFunctions.push(maybeCleanup as () => void);
            }
          }
          console.log("Auto-role feature initialized");
        } catch (innerErr: unknown) {
          console.warn("Autorole setup resolved with an error:", innerErr);
        }
      }
    } catch (error) {
      console.warn("Failed to load autorole feature:", error);
    }

    // Initialize presence feature
    try {
      const presenceModule = await import("../../features/presence");
      const startPresence =
        presenceModule.startPresence || presenceModule.default?.startPresence;
      if (typeof startPresence === "function") {
        // startPresence may return a cleanup function directly or a Promise that resolves to one.
        try {
          const maybeCleanup = startPresence(client) as unknown;
          if (maybeCleanup != null) {
            if (typeof (maybeCleanup as any).then === "function") {
              const cleanup = await (maybeCleanup as Promise<
                (() => void) | null | undefined
              >);
              if (typeof cleanup === "function") cleanupFunctions.push(cleanup);
            } else if (typeof maybeCleanup === "function") {
              cleanupFunctions.push(maybeCleanup as () => void);
            }
          }
          console.log("Presence feature initialized");
        } catch (innerErr: unknown) {
          console.warn("Presence setup resolved with an error:", innerErr);
        }
      }
    } catch (error) {
      console.warn("Failed to load presence feature:", error);
    }

    // Initialize prefix commands (static import)
    try {
      if (typeof setupPrefixCommands === "function") {
        try {
          const maybeCleanup = setupPrefixCommands() as unknown;
          if (maybeCleanup != null) {
            if (typeof (maybeCleanup as any).then === "function") {
              const cleanup = await (maybeCleanup as Promise<
                (() => void) | null | undefined
              >);
              if (typeof cleanup === "function") cleanupFunctions.push(cleanup);
            } else if (typeof maybeCleanup === "function") {
              cleanupFunctions.push(maybeCleanup as () => void);
            }
          }
          console.log("Prefix commands initialized");
        } catch (innerErr: unknown) {
          console.warn("Prefix setup resolved with an error:", innerErr);
        }
      }
    } catch (error) {
      console.warn("Failed to initialize prefix commands:", error);
    }

    // Register slash commands globally
    try {
      // Load all commands including slash commands
      await commandRegistry.registerAllCommands();

      const slashCommands = commandRegistry.getAllSlashCommands();
      if (slashCommands.length > 0) {
        const rest = new REST().setToken(config.token);
        const commands = slashCommands.map((cmd) => (cmd.data as any).toJSON());

        if (config.devGuildId) {
          await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.devGuildId),
            { body: commands },
          );
          console.log(
            `Registered ${slashCommands.length} slash commands to dev guild`,
          );
        } else {
          await rest.put(Routes.applicationCommands(config.clientId), {
            body: commands,
          });
          console.log(
            `Registered ${slashCommands.length} global slash commands`,
          );
        }
      }
    } catch (error) {
      console.warn("Failed to register slash commands:", error);
    }
  } catch (error) {
    console.error(
      "A critical error occurred during feature initialization:",
      error,
    );
  }
}

/**
 * Cleanup all registered features
 */
export function cleanupFeatures() {
  cleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  });
  cleanupFunctions.length = 0;
  isInitialized = false;
}
