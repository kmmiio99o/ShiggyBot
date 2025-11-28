import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

function runCommand(command) {
  console.log(`Executing: ${command}`);
  try {
    execSync(command, {
      stdio: "inherit",
      cwd: projectRoot,
    });
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    process.exit(error.status || 1);
  }
}

function start() {
  console.log("Starting ShiggyBot...");
  runCommand("bun ./dist/index.js");
}

start();
