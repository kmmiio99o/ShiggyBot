import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, ".."); // Assuming scripts is directly under project root

function startDev() {
  console.log("Starting development server with ts-node-dev...");
  console.log("Using: ts-node-dev --respawn --transpile-only src/index.ts");

  const child = spawn(
    "ts-node-dev",
    ["--respawn", "--transpile-only", "src/index.ts"],
    {
      stdio: "inherit", // Stream output to current process
      cwd: projectRoot, // Ensure commands run from the project root
      shell: true, // Use a shell to execute the command, allowing ts-node-dev to be found in PATH
    }
  );

  child.on("error", (error) => {
    console.error(`Failed to start development server: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Development server exited with code ${code}`);
      process.exit(code);
    }
  });
}

startDev();
