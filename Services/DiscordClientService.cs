using Discord;
using Discord.WebSocket;
using ShiggyBot.Configuration;
using ShiggyBot.Utils;
using ShiggyBot.Features;
using ShiggyBot.Data;
using ShiggyBot.Commands;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Services
{
    internal sealed class DiscordClientService : IDisposable
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
        private readonly WebhookLogger? _webhookLogger;
        // Ephemeral plugin handling is moved to PluginCommand; remove local cache.

        public DiscordClientService(BotConfig config, IConfiguration appConfig)
        {
            ArgumentNullException.ThrowIfNull(config);
            ArgumentNullException.ThrowIfNull(appConfig);

            _config = config;
            _appConfig = appConfig;

            Logger.Info("[INIT] Initializing ShiggyBot...");

            DiscordSocketConfig cfg = new()
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
            _client.ButtonExecuted += OnButtonExecutedAsync;

            Logger.Info("[INIT] Discord client created");

            // Initialize database
            _db = new();
            Logger.Info("[INIT] Database initialized");

            // Initialize command handling (pass database)
            _commandHandler = new(_client, config.Prefix, _appConfig, _db);
            Logger.Info("[INIT] Command handler initialized");

            // Initialize ban check service
            _banCheck = new(_client, _db);

            // Initialize webhook logger
            _webhookLogger = new(appConfig);
            Logger.Info("[INIT] Webhook logger initialized");
        }

        public async Task StartAsync()
        {
            if (string.IsNullOrWhiteSpace(_config.Token))
            {
                Logger.Error("[ERROR] DISCORD_TOKEN is not set. Exiting.");
                return;
            }

            Logger.Info("[STARTUP] Logging in to Discord...");
            await _client.LoginAsync(TokenType.Bot, _config.Token).ConfigureAwait(false);
            Logger.Info("[STARTUP] Starting Discord client...");
            await _client.StartAsync().ConfigureAwait(false);

            // Initialize features
            Logger.Info("[STARTUP] Initializing features...");
            _autorole = new(_client, _appConfig);
            Logger.Info("[STARTUP] Autorole feature loaded");
            _presence = new(_client, _appConfig);
            Logger.Info("[STARTUP] Presence feature loaded");
            _codePreview = new(_client);
            Logger.Info("[STARTUP] Code preview feature loaded");
            _commitPreview = new(_client);
            Logger.Info("[STARTUP] Commit preview feature loaded");

            // Start ban check service
            _banCheck.Start();

            Logger.Info("[STARTUP] All features initialized. Bot is running!");
            // Keep the process alive
            await Task.Delay(-1).ConfigureAwait(false);
        }

        private Task OnConnectedAsync()
        {
            Logger.Info("[STARTUP] Connected to Discord gateway");
            return Task.CompletedTask;
        }

        private Task OnDisconnectedAsync(Exception? ex)
        {
            Logger.Warn($"[WARNING] Disconnected from Discord gateway: {ex?.Message ?? "Unknown reason"}");
            return Task.CompletedTask;
        }

        private async Task OnReadyAsync()
        {
            Logger.Info($"[READY] ShiggyBot is ready! Logged in as {_client.CurrentUser.Username}#{_client.CurrentUser.Discriminator}");
            Logger.Info($"[READY] Connected to {_client.Guilds.Count} server(s)");
            if (_webhookLogger != null)
            {
                await _webhookLogger.LogErrorAsync("ShiggyBot shutting down").ConfigureAwait(false);
            }
        }

        private async Task OnMessageAsync(SocketMessage message)
        {
            if (message.Author.IsBot)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(message.Content))
            {
                return;
            }

            if (!message.Content.StartsWith(_config.Prefix, StringComparison.OrdinalIgnoreCase))
            {
                // Let features handle non-prefix messages (code preview, commit preview, etc.)
                return;
            }

            await _commandHandler.HandleAsync(message).ConfigureAwait(false);
        }

        private async Task OnButtonExecutedAsync(SocketMessageComponent component)
        {
            try
            {
                if (EphemeralButtonService.TryHandle(component))
                {
                    return;
                }

                await component.RespondAsync("This button is no longer available.", ephemeral: true).ConfigureAwait(false);
            }
            catch (InvalidOperationException)
            {
                // Response may have already been sent
            }
            catch (TimeoutException)
            {
                // Response may have already been sent
            }
            catch (OperationCanceledException ex)
            {
                Logger.Error($"[ERROR] Button interaction cancelled: {ex.Message}");
                try
                {
                    await component.RespondAsync("Operation was cancelled.", ephemeral: true).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    // Already cancelled, nothing more to do
                }
            }
            catch (HttpRequestException ex)
            {
                Logger.Error($"[ERROR] Button interaction failed: {ex.Message}", ex);
                try
                {
                    await component.RespondAsync("An error occurred.", ephemeral: true).ConfigureAwait(false);
                }
                catch (InvalidOperationException)
                {
                    // Response may have already been sent
                }
                catch (TimeoutException)
                {
                    // Response timed out
                }
            }
        }

        private async Task OnSelectMenuExecutedAsync(SocketMessageComponent component)
        {
            if (component.Data.CustomId != "help_category_select")
            {
                return;
            }

            string? selectedCategory = component.Data.Values.FirstOrDefault();
            if (string.IsNullOrEmpty(selectedCategory))
            {
                return;
            }

            Dictionary<string, List<ICommand>> categories = _commandHandler.GetCommandsByCategory();

            if (categories.TryGetValue(selectedCategory, out List<ICommand>? commands))
            {
                string prefix = _commandHandler.Prefix;
                Embed embed = EmbedHelper.BuildCategoryHelpEmbed(selectedCategory, commands, prefix);

                // Rebuild select menu for navigation
                SelectMenuBuilder menu = new()
                {
                    CustomId = "help_category_select",
                    Placeholder = "Select a category...",
                    MinValues = 1,
                    MaxValues = 1
                };

                foreach (KeyValuePair<string, List<ICommand>> category in categories)
                {
                    string emoji = EmbedHelper.GetCategoryEmoji(category.Key);
                    string keyLower = category.Key.ToUpperInvariant();
                    menu.AddOption(category.Key, keyLower, $"View {keyLower} commands", new Emoji(emoji));
                }

                MessageComponent messageComponents = new ComponentBuilder().WithSelectMenu(menu).Build();

                await component.UpdateAsync(msg =>
                {
                    msg.Embed = embed;
                    msg.Components = messageComponents;
                }).ConfigureAwait(false);
            }
        }

        public void Dispose()
        {
            _autorole?.Unregister();
            _codePreview?.Unregister();
            _commitPreview?.Unregister();
            _presence?.Dispose();
            _banCheck?.Stop();
            _banCheck?.Dispose();
            _commandHandler?.Dispose();
            _db?.Dispose();
            _client?.Dispose();
            _webhookLogger?.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
