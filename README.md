# ShiggyBot

A small, extensible Discord bot scaffold written in TypeScript. Designed to be easy to run locally, deploy to a Node host, and extend with new commands and event handlers. The repository includes:

- An automatic autorole feature (assigns a role to new members when they join).
- A presence (activity) rotation module that updates the bot status and activity text.
- A simple, clean project layout to add commands and persistence.

This README explains what each part is, how to configure and run the bot, and recommended next steps.

---

## Table of contents

- [What is included](#what-is-included)
- [Requirements](#requirements)
- [Configuration](#configuration)
- [Local development](#local-development)
- [Running in production](#running-in-production)
- [How features work (internals)](#how-features-work-internals)
  - [Autorole (`src/events/autorole.ts`)](#autorole-srceventsautorotets)
  - [Presence rotation (`src/events/presence.ts`)](#presence-rotationsrceventspresencets)
- [Environment variables (.env)](#environment-variables-env)
- [Using Bun / npm / pnpm](#using-bun--npm--pnpm)
- [Extending the bot](#extending-the-bot)
- [Troubleshooting & common issues](#troubleshooting--common-issues)
- [Next steps / optional improvements](#next-steps--optional-improvements)

---

## What is included

Key files and directories:

- `src/index.ts` — bot entry point, client creation, command registration and bootstrapping of event modules.
- `src/events/autorole.ts` — autorole handler that assigns a configured role to new members.
- `src/events/presence.ts` — presence/activity rotation module; configurable through env.
- `src/events/index.ts` — barrel that re-exports the event utilities.
- `src/commands/` — place to add slash command modules (the scaffold currently registers no built-in commands by default).
- `package.json`, `tsconfig.json`, `tsconfig.build.json` — build/dev scripts and TypeScript configs.
- `.env.example` — example environment variables.

---

## Requirements

- Node.js 18+ (recommended for running the built app).
- Alternatively, Bun can be used as the package manager for installs; Node is still recommended as the runtime.
- A Discord Application / Bot and a bot token. You must invite the bot to the guild(s) where you want it to operate.

Make sure the bot has:
- `Manage Roles` permission in the guild(s) where it will assign roles.
- A role **higher** than the role it needs to assign (role hierarchy).

If you use the Guild Members gateway intent (`GuildMembers`) the application must have "Server Members Intent" enabled in the Developer Portal (and if the bot is in 100+ guilds, verification is required).

---

## Configuration

Create a `.env` file in the project root (copy from `.env.example`) with at least the required environment variable:

- `DISCORD_TOKEN` — your bot token.

Optional and useful environment variables:

- `CLIENT_ID` — application client id (used for command registration).
- `DEV_GUILD_ID` — guild id for fast, guild-scoped command registration during development.
- `WELCOME_ROLE_ID` — role ID to auto-assign when members join. If not provided the scaffold falls back to a built-in role ID used in development/testing.
- `PRESENCE_STATUS` — one of `online | idle | dnd | invisible` (default: `idle`).
- `PRESENCE_INTERVAL` — rotation interval in seconds (default in scaffold: `5` seconds; increase for production to reduce updates).
- `PRESENCE_ACTIVITIES` — override activities (JSON or `TYPE:Text` list).

You can find a full example in `./.env.example`.

---

## Local development

1. Install dependencies

- With Bun (package manager):
  - `bun install`

- With npm:
  - `npm install`

- With pnpm:
  - `pnpm install`

2. Create `.env` from `.env.example` and fill in values.

3. Run in development mode (hot reload):

- npm/pnpm:
  - `npm run dev` or `pnpm run dev`

- Bun:
  - `bun run dev` (note: Bun runs a simple watcher for convenience; ts-node-dev is used for Node-based dev loop).

4. Build and run (production-style)

- Build:
  - `npm run build` or `bun run build`

- Run:
  - `npm start` (runs `node dist/index.js`) — recommended runtime is Node 18+.

---

## Running in production

- Keep `DISCORD_TOKEN` and `CLIENT_ID` in your environment secrets (do not commit them).
- Deploy to a host that supports long-running Node processes (DigitalOcean, Fly.io, Render, Railway, Heroku, Docker in a VPS, etc.). Do not host the bot process on Cloudflare Pages — Pages does not support persistent WebSocket connections required by discord.js.

Optional: Create a `Dockerfile` that builds the project (runs `npm run build`) and runs `node dist/index.js`.

---

## How features work (internals)

This section explains how the autorole and presence features work so you can maintain/extend them.

### Autorole (`src/events/autorole.ts`)

- Trigger: listens to the `guildMemberAdd` event.
- Behavior:
  - Reads `WELCOME_ROLE_ID` from environment variables (or falls back to a built-in fallback role ID used by the scaffold).
  - Verifies the bot has `Manage Roles` permission in the guild.
  - Fetches the target role (checks both cache and API).
  - Verifies role hierarchy (bot's highest role must be above the target role).
  - If checks pass, it attempts to `member.roles.add(role)`.
  - Logs success or helpful warnings on failure.
- Notes:
  - The bot must have the `GuildMembers` intent to receive `guildMemberAdd` events. Enable "Server Members Intent" in the Discord Developer Portal for your application.
  - Role IDs are numeric strings — copy them from Discord (enable Developer Mode in Discord settings, right-click a role or guild to copy the ID).

### Presence rotation (`src/events/presence.ts`)

- Purpose: set the bot's `presence` (status and activities) and rotate through multiple activities periodically.
- Configuration:
  - `PRESENCE_STATUS` — `online | idle | dnd | invisible` (default: `idle`).
  - `PRESENCE_INTERVAL` — seconds between rotation ticks (default: `5` seconds in the scaffold; consider 30+ seconds for production).
  - `PRESENCE_ACTIVITIES` — override activity list:
    - JSON array of objects: `[{"name":"for /getrole","type":"WATCHING"}, ...]`
    - Or `TYPE:Text` pairs separated by `|` or `,` (e.g., `WATCHING:welcoming members|LISTENING:use /help`).
- Behavior:
  - Builds a mixed activity list from static activities and dynamic ones (server count, approximate member totals).
  - Rotates through activities on the configured interval and sets the bot status to the configured `PRESENCE_STATUS`.
- Notes:
  - Discord rate-limits presence updates. Frequent updates (e.g., every 5 seconds) are OK for development but may be risky in production. Increase `PRESENCE_INTERVAL` for production.

---

## Environment variables (`.env`)

Important values you should set in `.env`:

- `DISCORD_TOKEN` — (required) your bot token.
- `CLIENT_ID` — (recommended) your app client id for command registration.
- `DEV_GUILD_ID` — (optional) guild id for fast command registration during development.
- `WELCOME_ROLE_ID` — (optional) role ID to assign automatically on join.
- `PRESENCE_STATUS` — `idle` (default).
- `PRESENCE_INTERVAL` — `5` (default, seconds).
- `PRESENCE_ACTIVITIES` — override default activities (see above).

Use `./.env.example` as a template.

---

## Using Bun vs npm/pnpm

- Bun is a fast package manager and is fine for local development and installs (`bun install`). The scaffold includes Bun-friendly scripts.
- For runtime stability, prefer Node 18+ to run the built output (`node dist/index.js`). Some libraries (discord.js and its dependencies) are primarily developed and tested under Node; Bun's runtime compatibility is improving but is not guaranteed for all runtime behavior.
- Recommended workflow:
  - Use Bun for installs if you like (`bun install`).
  - Use Node for the production runtime (`npm run build` + `npm start`).

---

## Extending the bot

Where to add things:

- Commands:
  - Add slash command modules in `src/commands`. Export a `data` (SlashCommandBuilder JSON) and an `execute(interaction)` handler.
  - Update `src/index.ts` to dynamically load commands or create a loader that registers all commands from `src/commands`.

- Event handlers:
  - Add modules under `src/events` and re-export them from `src/events/index.ts`.
  - The scaffold already loads `presence` and `autorole` if they exist.

- Persistence:
  - For per-guild settings (e.g., different welcome role per guild) add a small DB or JSON store.
  - Recommended: SQLite (file-based), or a hosted Postgres/Redis if you need distributed state.

- Admin commands:
  - Add a `/setautorole <role>` command that stores the role ID per guild. On `guildMemberAdd`, read the per-guild config and assign the configured role.

---

## Troubleshooting & common issues

- "Used disallowed intents" / login failing:
  - Enable the corresponding privileged intents (e.g., Server Members Intent) in the Discord Developer Portal for your app.

- Role not assigned:
  - Ensure the bot has `Manage Roles` permission.
  - Ensure the bot’s highest role is above the target role in server role hierarchy.
  - Ensure `WELCOME_ROLE_ID` is correct and exists in the server.

- Commands not appearing:
  - If you register global commands they can take up to an hour to propagate. Use `DEV_GUILD_ID` for quick guild-scoped registration during development.

- TypeScript build errors:
  - Run `npm run build` to surface TypeScript diagnostics. Fix types or imports accordingly. The scaffold includes `tsconfig.build.json` used by the `build` script.
