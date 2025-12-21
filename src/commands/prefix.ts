import { Client } from "discord.js";
import path from "path";
import fs from "fs/promises";
import { commandRegistry } from "./index";
import { PrefixCommand } from "./types";

/**
 * Dynamically loads and registers prefix commands.
 *
 * This function now performs registration synchronously from the caller's
 * perspective (it is async and therefore should be awaited by callers such as
 * the ready handler). Making it `async` allows the ready handler to `await`
 * it, ensuring prefix commands are registered before other code (e.g. help)
 * relies on them.
 *
 * The loader attempts to discover prefix commands in the following sub-directories
 * (relative to this module's directory):
 * - moderation
 * - search
 * - utility
 *
 * It will attempt to import any `.js` or `.ts` files it finds and register the
 * default export (or the module itself) as a `PrefixCommand`.
 */
export async function setupPrefixCommands(client: Client): Promise<() => void> {
  try {
    const commandsBasePath = __dirname;
    const candidateDirs = ["moderation", "search", "utility"];

    let totalRegistered = 0;

    for (const dir of candidateDirs) {
      const dirPath = path.join(commandsBasePath, dir);
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          // Only consider JS/TS files (runtime will usually be .js)
          if (!file.endsWith(".js") && !file.endsWith(".ts")) continue;

          const modulePath = path.join(dirPath, file);

          try {
            // Dynamic import of the command module
            const imported = await import(modulePath);
            const command: PrefixCommand | undefined =
              (imported && (imported.default ?? imported)) || undefined;

            if (
              command &&
              typeof command === "object" &&
              typeof (command as PrefixCommand).execute === "function" &&
              (command as PrefixCommand).name
            ) {
              commandRegistry.registerPrefixCommand(command as PrefixCommand);
              totalRegistered++;
            } else {
              console.warn(
                `⚠️ Prefix command file ${modulePath} does not export a valid PrefixCommand.`,
              );
            }
          } catch (err) {
            console.error(
              `❌ Failed to import prefix command ${modulePath}:`,
              err,
            );
          }
        }
      } catch (err: any) {
        // Directory might not exist; that's ok — skip it.
        if (err && err.code === "ENOENT") {
          // no-op, directory missing
        } else {
          console.warn(`⚠️ Error reading prefix commands dir ${dirPath}:`, err);
        }
      }
    }

    console.log(
      `✅ Prefix command loader complete. Registered ${totalRegistered} prefix commands.`,
    );
  } catch (error) {
    console.error("❌ Error while loading prefix commands:", error);
  }

  // Return a simple cleanup function (no-op). If in future commands need teardown,
  // we can implement unregister logic here.
  return () => {
    // Intentionally left blank.
  };
}
