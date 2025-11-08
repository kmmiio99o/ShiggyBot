import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, ".."); // Assuming scripts is directly under project root

function runCommand(command, options = {}) {
  console.log(`Executing: ${command}`);
  execSync(command, {
    stdio: "inherit", // Stream output to current process
    cwd: projectRoot, // Ensure commands run from the project root
    ...options,
  });
}

async function build() {
  try {
    console.log("Cleaning up previous build...");
    runCommand("rimraf dist");

    console.log("Building TypeScript project...");
    // Using 'bunx' for tsc ensures it's resolved correctly within bun or npm/yarn environments
    runCommand("bunx tsc -p tsconfig.build.json");

    console.log("Build complete.");
  } catch (error) {
    console.error("Build failed:", error.message);
    process.exit(1);
  }
}

build();
