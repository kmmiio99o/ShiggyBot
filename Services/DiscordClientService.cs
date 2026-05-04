using System;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Configuration;
using ShiggyBot.Utils;
using ShiggyBot.Features;
using ShiggyBot.Commands;
using ShiggyBot.Data;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Services
{
    public class DiscordClientService : IDisposable
    {
        private readonly BotConfig _config;
        private readonly DiscordSocketClient _client;
        private readonly IConfiguration _appConfig;
        private readonly CommandHandler _commandHandler;
        private readonly DatabaseService _db;
        private readonly BanCheckService _banCheck;
        private AutoroleFeature? _autorole;
        private PresenceFeature? _presence;
        private CodePreviewFeature? _codePreview;
        private CommitPreviewFeature? _commitPreview;
        private WebhookLogger? _webhookLogger;

        public DiscordClientService(BotConfig config, IConfiguration appConfig)
        {
            _config = config;
            _appConfig = appConfig;

            Console.WriteLine("[INIT] Initializing ShiggyBot...");

            var cfg = new DiscordSocketConfig
            {
                GatewayIntents = GatewayIntents.Guilds
                                 | GatewayIntents.GuildMembers
                                 | GatewayIntents.GuildMessages
                                 | GatewayIntents.MessageContent
            };
            _client = new DiscordSocketClient(cfg);
            // Log += LogAsync; // Disabled in favor of custom logs
            _client.Ready += OnReadyAsync;
            _client.Connected += OnConnectedAsync;
            _client.Disconnected += OnDisconnectedAsync;
            _client.MessageReceived += OnMessageAsync;
            _client.SelectMenuExecuted += OnSelectMenuExecutedAsync;

            Console.WriteLine("[INIT] Discord client created");

            // Initialize database
            _db = new();
            Console.WriteLine("[INIT] Database initialized");

            // Initialize command handling (pass database)
            _commandHandler = new(_client, config.Prefix, _appConfig, _db);
            Console.WriteLine("[INIT] Command handler initialized");

            // Initialize ban check service
            _banCheck = new(_client, _db);

            // Initialize webhook logger
            _webhookLogger = new(appConfig);
            Console.WriteLine("[INIT] Webhook logger initialized");
        }

        public async Task StartAsync()
        {
            if (string.IsNullOrWhiteSpace(_config.Token))
            {
                Console.WriteLine("[ERROR] DISCORD_TOKEN is not set. Exiting.");
                return;
            }

            Console.WriteLine("[STARTUP] Logging in to Discord...");
            await _client.LoginAsync(TokenType.Bot, _config.Token);
            Console.WriteLine("[STARTUP] Starting Discord client...");
            await _client.StartAsync();

            // Initialize features
            Console.WriteLine("[STARTUP] Initializing features...");
            _autorole = new(_client, _appConfig);
            Console.WriteLine("[STARTUP] Autorole feature loaded");
            _presence = new(_client, _appConfig);
            Console.WriteLine("[STARTUP] Presence feature loaded");
            _codePreview = new(_client);
            Console.WriteLine("[STARTUP] Code preview feature loaded");
            _commitPreview = new(_client);
            Console.WriteLine("[STARTUP] Commit preview feature loaded");

            // Start ban check service
            _banCheck.Start();

            Console.WriteLine("[STARTUP] All features initialized. Bot is running!");
            // Keep the process alive
            await Task.Delay(-1);
        }

        private Task OnConnectedAsync()
        {
            Console.WriteLine("[STARTUP] Connected to Discord gateway");
            return Task.CompletedTask;
        }

        private Task OnDisconnectedAsync(Exception? ex)
        {
            Console.WriteLine($"[WARNING] Disconnected from Discord gateway: {ex?.Message ?? "Unknown reason"}");
            return Task.CompletedTask;
        }

        private Task OnReadyAsync()
        {
            Console.WriteLine($"[READY] ShiggyBot is ready! Logged in as {_client.CurrentUser.Username}#{_client.CurrentUser.Discriminator}");
            Console.WriteLine($"[READY] Connected to {_client.Guilds.Count} server(s)");
            _webhookLogger?.LogInfoAsync("Bot started and ready.").Wait();
            return Task.CompletedTask;
        }

        private async Task OnMessageAsync(SocketMessage message)
        {
            if (message.Author.IsBot) return;
            if (string.IsNullOrWhiteSpace(message.Content)) return;

            if (!message.Content.StartsWith(_config.Prefix, StringComparison.OrdinalIgnoreCase))
            {
                // Let features handle non-prefix messages (code preview, commit preview, etc.)
                return;
            }

            await _commandHandler.HandleAsync(message);
        }

        private async Task OnSelectMenuExecutedAsync(SocketMessageComponent component)
        {
            if (component.Data.CustomId != "help_category_select") return;

            var selectedCategory = component.Data.Values.FirstOrDefault();
            if (string.IsNullOrEmpty(selectedCategory)) return;

            var categories = _commandHandler.GetCommandsByCategory();

            if (categories.TryGetValue(selectedCategory, out var commands))
            {
                var prefix = _commandHandler.Prefix;
                var embed = EmbedHelper.BuildCategoryHelpEmbed(selectedCategory, commands, prefix);

                // Rebuild select menu for navigation
                var menu = new SelectMenuBuilder
                {
                    CustomId = "help_category_select",
                    Placeholder = "Select a category...",
                    MinValues = 1,
                    MaxValues = 1
                };

                foreach (var category in categories)
                {
                    var emoji = EmbedHelper.GetCategoryEmoji(category.Key);
                    menu.AddOption(category.Key, category.Key.ToLower(), $"View {category.Key.ToLower()} commands", new Emoji(emoji));
                }

                var components = new ComponentBuilder().WithSelectMenu(menu).Build();

                await component.UpdateAsync(msg =>
                {
                    msg.Embed = embed;
                    msg.Components = components;
                });
            }
        }

        public void Dispose()
        {
            _autorole?.Unregister();
            _codePreview?.Unregister();
            _commitPreview?.Unregister();
            _presence?.Dispose();
            _banCheck?.Stop();
            _db?.Dispose();
            _client?.Dispose();
        }
    }
}
