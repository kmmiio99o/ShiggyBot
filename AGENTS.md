# ShiggyBot

Discord bot in C# / .NET 10, Discord.Net 3.19.1, SQLite.

## Build & run

```bash
dotnet build          # build only
dotnet build && dotnet run   # build and run (requires DISCORD_TOKEN)
dotnet publish -c Release -r linux-x64 --self-contained  # publish to publish/
```

**TreatWarningsAsErrors=true** and **AnalysisMode=All** are set. Build will fail on any warning.

## Config loading order

1. `appsettings.json` (gitignored — contains a sample token, but should contain real values)
2. Environment variables
3. `config.txt` (INI-style `KEY=VALUE`, `#` comments, optional at runtime)
4. `DISCORD_TOKEN` and `PREFIX` fall back to `Environment.GetEnvironmentVariable()` in `BotConfig.LoadFromConfiguration`

Expected config values: `DISCORD_TOKEN`, `PREFIX` (default `S`), `WELCOME_ROLE_ID`, `PRESENCE_STATUS`, `PRESENCE_INTERVAL`, `LOG_WEBHOOK_URL`, `HF_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_WEBHOOK_CHANNEL_ID`, `DEV_GUILD_ID`.

## Architecture

- **Entrypoint:** `Program.cs` — top-level statements, registers global exception handlers, loads config, starts `DiscordClientService`
- **Orchestrator:** `DiscordClientService` — creates `DiscordSocketClient`, initializes all features, wires event handlers, connects to gateway
- **Commands (`Commands/ICommand`):** registered in `CommandHandler.RegisterCommands()`. Interface: `Name`, `Description`, `Category`, `Aliases`, `ExecuteAsync(SocketUserMessage, string[], DiscordSocketClient)`
- **Features (`Features/`):** runtime capabilities that attach to client events. Autorole (join roles), Presence (rotating GitHub stats), CodePreview (auto-fetches code links), CommitPreview (paginated commit diffs)
- **DB:** SQLite via `Microsoft.Data.Sqlite`, stored at `AppContext.BaseDirectory/shiggybot.db`. Tables: `TimedBans`, `DisabledCommands`, `GuildConfig`

## Commands

| Command | Category | Notes |
|---------|----------|-------|
| `Shelp` | Utility | Interactive select menu, per-command detail |
| `Sping` | Utility | Latency check |
| `Snote <key>` | Utility | Hard-coded notes about ShiggyCord |
| `Sai <msg>` | Utility | Llama 3.1 8B via Hugging Face (needs `HF_TOKEN`). Aliases: `gemini`, `ask`, `clearai`. Per-user conversation memory (last 20 turns) |
| `Sban <user> [duration] [reason]` | Moderation | Supports timed bans (`7d`, `30m`, etc.). Reply-to-shortcut. Persists to DB |
| `Skick <user> [reason]` | Moderation | Reply-to-shortcut |
| `Stimeout` | Moderation | |
| `Spurge <count>` | Moderation | 1–100, respects 14-day Discord limit |
| `Snuke confirm` | Moderation | Clones channel, deletes original. Admin only |
| `Saddrole` / `Sremoverole` | Moderation | |
| `Sdisable` / `Senable` | Moderation | Per-guild command disable (persisted) |
| `Ssetwelcome <role>` | Moderation | Sets autorole for the guild |
| `Splugin <name>` | Search | Fetches from remote index (60 min cache), Levenshtein search, ephemeral install button |
| `Sgoogle <query>` | Search | Generates Google search link |

## Extending

- **New command:** implement `ICommand` in `Commands/<Category>/`, add `Register(new FooCommand())` in `CommandHandler.RegisterCommands()`
- **New feature:** create class under `Features/`, initialize in `DiscordClientService.StartAsync()` before connecting
- **New data:** extend `DatabaseService` — schema initializes on startup via `CREATE TABLE IF NOT EXISTS`

## GitHub repo monitor

Polls the GitHub API every 5 minutes for new commits, PRs, and star changes. Posts to the configured Discord channel. Config:
- `GITHUB_REPO` — `owner/repo` format, e.g. `kmmiio99o/ShiggyCord`
- `GITHUB_TOKEN` — optional, for higher API rate limits
- `GITHUB_WEBHOOK_CHANNEL_ID` — Discord channel ID to post to (required)

First poll caches state silently; subsequent polls detect and post new items. Uses in-memory dedup (resets on restart).

## Gateway intents

`Guilds | GuildMembers | GuildMessages | MessageContent` — if you add a feature that needs more, update `DiscordSocketConfig` in `DiscordClientService`.

## Style

- `TreatWarningsAsErrors=true`, `EnforceCodeStyleInBuild=true`, `AnalysisMode=All`
- Custom `.editorconfig` with many IDE warnings enabled at `warning` level
- `GenerateDocumentationFile=true` — all public/internal API needs `<summary>` XML comments
- XML doc strings are generated — expect them in build output
- `ServerGarbageCollection=false`

## Git

- `appsettings.json`, `shiggybot.db`, `config.txt`, `bin/`, `obj/`, `publish/` are gitignored
- Never commit a real `DISCORD_TOKEN`
