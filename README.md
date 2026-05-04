<div align="center">
  <img src="https://cdn.kmmiio99o.dev/shiggycord/l4exhy.gif" alt="ShiggyBot Icon" width="120" />
  <br/>
  <h1>ShiggyBot</h1>
</div>

> A modular Discord bot built with C# and .NET 10.0 using Discord.Net

[![GitHub Repository](https://img.shields.io/badge/GitHub-kmmiio99o%2FShiggyBot-181717?style=for-the-badge&logo=github)](https://github.com/kmmiio99o/ShiggyBot)
[![.NET Version](https://img.shields.io/badge/.NET-10.0-512BD4?style=for-the-badge&logo=dotnet)](https://dotnet.microsoft.com/)
[![Discord.Net](https://img.shields.io/badge/Discord.Net-3.17.0-5865F2?style=for-the-badge&logo=discord)](https://discordnet.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

The project is structured to be extended with new commands and features while keeping core logic centralized in a few well-defined services.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Commands and Features](#commands-and-features)
- [Development and Testing](#development-and-testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Notes](#notes)

---

## Overview

ShiggyBot is designed to run as a self-hosted Discord bot. It connects to Discord via a bot token, loads a set of modular commands, and initializes several optional features (such as autorole, presence updates, and preview helpers) at startup. It is implemented in C# using the .NET 10.0 framework.

**Key Technologies**

| Technology | Purpose |
|------------|---------|
| C# / .NET 10.0 | Core framework |
| Discord.Net | Discord API integration |
| Microsoft.Extensions.Configuration | Configuration management |
| Built-in DI | Dependency injection and service lifecycle |

The architecture is pluggable with three main extension points: **Commands**, **Features**, and **Data** components.

---

## Quick Start

**Prerequisites**

- .NET 10.0 SDK or later
- A Discord bot token (from the [Discord Developer Portal](https://discord.com/developers/applications))

**Steps**

```bash
# 1. Clone the repository
git clone https://github.com/kmmiio99o/ShiggyBot.git
cd ShiggyBot

# 2. Configure your bot token (see Configuration section below)

# 3. Build the project
dotnet build

# 4. Run the bot
dotnet run
```

---

## Configuration

The bot reads configuration from `appsettings.json` and environment variables.

### Configuration Options

| Setting | Description |
|:--------|:------------|
| `DISCORD_TOKEN` | Bot token for Discord authentication **(never commit this)** |
| `PREFIX` | Command prefix (default: `S`) |
| `WELCOME_ROLE_ID` | Role ID to assign on welcome events |
| `PRESENCE_STATUS` | Bot presence status (idle, online, etc.) |
| `PRESENCE_INTERVAL` | Presence refresh interval in seconds |
| `LOG_WEBHOOK_URL` | Optional webhook URL for internal logs |
| `HF_TOKEN` | Hugging Face token (optional) |
| `GITHUB_TOKEN` | GitHub token (optional) |
| `DEV_GUILD_ID` | Development server/guild identifier |

### Token Loading

The `BotConfig.LoadFromConfiguration` method reads `DISCORD_TOKEN` and `PREFIX` from configuration, falling back to environment variables when needed. The bot logs whether the token was successfully loaded and which prefix is active.

---

## Architecture

The architecture is designed to be small, modular, and extensible. It splits responsibilities into clear layers and runs as a hosted service inside a .NET 10.0 application.

### Design Principles

- **Modular**: Commands and Features are plug-ins discovered at startup
- **Decoupled**: Core runtime has minimal knowledge of specific commands
- **Configurable**: Settings drive behavior, not hardcoded values
- **Observable**: Optional webhook logging for production monitoring

### Core Components

| Component | Responsibility |
|:----------|:---------------|
| `Program.cs` | Entry point, builds config, registers services |
| `DiscordClientService` | Central orchestrator, client lifecycle, event wiring |
| `CommandHandler` | Discovers and dispatches commands implementing `ICommand` |
| `Features` | Runtime capabilities (Autorole, Presence, Previews) |
| `DatabaseService` | Persistence and data utilities |
| `WebhookLogger` | Optional webhook-based log sink |

### Startup Flow

Overview
- The application boots from Program.cs. It loads configuration, builds the DI container, and starts hosted services that drive the bot lifecycle.
- The primary runtime entity is DiscordClientService, which wires the Discord client, initializes features, loads commands, and establishes the gateway connection.

Startup Sequence
```
Program.cs
    ├── Load Configuration (appsettings.json + env vars)
    ├── Build DI container and register services
    └── Start Hosted Services
            └── DiscordClientService
                    ├── Create Discord Client
                    ├── Initialize Features (Autorole, Presence, Preview)
                    ├── Load Commands
                    ├── Wire WebhookLogger (optional)
                    └── Connect to Discord Gateway
```

Notes
- Configuration precedence: appsettings.json values can be overridden by environment variables (e.g., DISCORD_TOKEN, PREFIX).
- If a feature or token is missing, startup logs will indicate the issue and the bot may exit gracefully depending on the failure mode.
- Webhook logging is optional; enable by setting LOG_WEBHOOK_URL in configuration.

### Extensibility Points

- **New Command**: Implement `ICommand` in the `Commands` namespace
- **New Feature**: Create class under `Features`, initialize in `DiscordClientService`
- **New Data Source**: Extend `DatabaseService` or add new utilities

---

## Commands and Features

### Commands

Commands are organized in the `Commands` folder with sub-folders for different categories:

```
Commands/
├── Moderation/
├── Search/
├── Utility/
└── ...
```

Each command implements the `ICommand` interface, providing:
- `Name` - Unique command identifier
- `Description` - Help text
- `Category` - Logical grouping
- `Aliases` - Alternative command names
- `ExecuteAsync` - Core command logic

### Features

Features provide runtime capabilities initialized at bot startup:

| Feature | Description |
|:--------|:------------|
| Autorole | Automatically assign roles to new members |
| Presence | Update bot status on an interval |
| CodePreview | Generate previews of code snippets |
| CommitPreview | Display GitHub commit information |

---

## Development and Testing

### Local Testing

1. Create a test Discord server (guild)
2. Invite your bot to the test server
3. Set `DEV_GUILD_ID` to your test server ID
4. Run this commands:
```
dotnet build && dotnet run
```
to verify the bot and command behavior


---

## Contributing

### How to Add a New Command

1. Create a new class in the appropriate subfolder under `Commands/`
2. Implement the `ICommand` interface
3. Add your command logic in `ExecuteAsync`
4. Ensure the `CommandHandler` discovers it at startup

### How to Add a New Feature

1. Create a new class under `Features/`
2. Implement initialization logic (event handlers, timers, etc.)
3. Register and initialize the feature in `DiscordClientService`

### Documentation

- Update this README to reflect new capabilities and configuration options
- Keep the table of contents and structure consistent

### Security

- **Never commit secrets** (`DISCORD_TOKEN`, etc.) to the repository
- Use `.gitignore` to exclude sensitive configuration files

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Notes

- The `appsettings.json` in the repository contains a **sample token**. Do not use real tokens in shared repositories.
- This README reflects the current project structure. If the codebase evolves, update this document to stay aligned.
- For issues or feature requests, please use the [GitHub Issues](https://github.com/kmmiio99o/ShiggyBot/issues) page.
