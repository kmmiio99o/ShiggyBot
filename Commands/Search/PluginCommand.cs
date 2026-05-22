using Discord;
using Discord.Rest;
using Discord.WebSocket;
using ShiggyBot.Services;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Search
{
    /// <summary>
    /// Command to search for Discord plugins and extensions.
    /// </summary>
    internal sealed class PluginCommand : ICommand
    {
        private readonly PluginService _pluginService;

        internal PluginCommand(PluginService pluginService)
        {
            _pluginService = pluginService;
        }

        /// <summary>Gets the command name.</summary>
        public string Name => "plugin";
        /// <summary>Gets the command description.</summary>
        public string Description => "Search for Discord plugins and extensions";
        /// <summary>Gets the command category.</summary>
        public string Category => "Search";
        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => ["plugins", "plg", "plug"];

        /// <summary>Executes the command.</summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            try
            {
                // Validate arguments
                if (args.Length == 0)
                {
                    EmbedBuilder errEmbed = new()
                    {
                        Title = "Error",
                        Description = "Please provide a plugin name to search.",
                        Color = new Color(0xE74C3C)
                    };
                    errEmbed.AddField("Usage", "`plugin <name>`", inline: false);
                    await message.Channel.SendMessageAsync(embed: errEmbed.Build()).ConfigureAwait(false);
                    return;
                }

                // Search for plugin
                string query = string.Join(" ", args);
                EmbedBuilder searchEmbed = new()
                {
                    Title = "🔌 Plugin Search",
                    Description = $"Searching for: **{query}**",
                    Color = new Color(0x3498DB)
                };
                searchEmbed.AddField("Status", "⏳ Searching...", inline: false);
                RestUserMessage statusMessage = await message.Channel.SendMessageAsync(embed: searchEmbed.Build()).ConfigureAwait(false);

                try
                {
                    PluginResult? result = await _pluginService.SearchPluginAsync(query).ConfigureAwait(false);

                    if (result != null)
                    {
                        await statusMessage.DeleteAsync().ConfigureAwait(false);
                        // Register ephemeral install handler for this result
                        EphemeralButtonService.Register($"plugin_install_{result.Name}", async (component) =>
                        {
                            if (string.IsNullOrWhiteSpace(result.InstallUrl))
                            {
                                await component.RespondAsync("Install link not available.", ephemeral: true).ConfigureAwait(false);
                                return;
                            }
                            EmbedBuilder embed = new()
                            {
                                Title = $"📥 Install {result.Name}",
                                Description = $"[Click here to install]({result.InstallUrl})",
                                Color = new Color(0x27AE60),
                                Url = result.InstallUrl,
                                Footer = new EmbedFooterBuilder { Text = "This message is only visible to you" }
                            };

                            await component.RespondAsync(embed: embed.Build(), ephemeral: true).ConfigureAwait(false);
                        });
                        await HandleSuccessfulSearchAsync(message, result).ConfigureAwait(false);
                    }
                    else
                    {
                        await statusMessage.ModifyAsync(x => x.Embed = BuildNotFoundEmbed(query)).ConfigureAwait(false);
                    }
                }
                catch (HttpRequestException ex)
                {
                    await statusMessage.ModifyAsync(x => x.Embed =
                        EmbedHelper.BuildErrorEmbed($"Search failed: {ex.Message}")).ConfigureAwait(false);
                }
                catch (TaskCanceledException ex)
                {
                    await statusMessage.ModifyAsync(x => x.Embed =
                        EmbedHelper.BuildErrorEmbed($"Search timed out: {ex.Message}")).ConfigureAwait(false);
                }
            }
            catch (HttpRequestException ex)
            {
                await message.Channel.SendMessageAsync(
                    embed: EmbedHelper.BuildErrorEmbed($"An error occurred: {ex.Message}")).ConfigureAwait(false);
            }
            catch (TaskCanceledException ex)
            {
                await message.Channel.SendMessageAsync(
                    embed: EmbedHelper.BuildErrorEmbed($"Request timed out: {ex.Message}")).ConfigureAwait(false);
            }
        }

        private static async Task HandleSuccessfulSearchAsync(SocketUserMessage message, PluginResult result)
        {
            EmbedBuilder embed = new()
            {
                Title = $"🔌 {result.Name}",
                Description = result.Description,
                Color = GetStatusColor(result.Status)
            };

            // Add status field with emoji
            string statusEmoji = GetStatusEmoji(result.Status);
            embed.AddField("Status", $"{statusEmoji} {result.Status}", inline: true);

            // Add authors if available
            if (result.Authors.Count > 0)
            {
                embed.AddField("Authors", string.Join(", ", result.Authors), inline: true);
            }

            // Add warning message if present
            if (!string.IsNullOrWhiteSpace(result.WarningMessage))
            {
                embed.AddField("⚠️ Warning", result.WarningMessage, inline: false);
            }

            // Build buttons
            ComponentBuilder componentBuilder = new();

            // Add Install button
            if (!string.IsNullOrWhiteSpace(result.InstallUrl))
            {
                componentBuilder.WithButton("📥 Install", customId: $"plugin_install_{result.Name}", style: ButtonStyle.Primary);
            }

            // Add Source button as a link to the repository
            if (!string.IsNullOrWhiteSpace(result.SourceUrl))
            {
                // Use a URL button that opens the repository directly
                componentBuilder.WithButton("📂 Source", url: result.SourceUrl, style: ButtonStyle.Link);
            }

            // Send the main plugin info embed with buttons
            await message.Channel.SendMessageAsync(embed: embed.Build(), components: componentBuilder.Build()).ConfigureAwait(false);
        }

        private static Embed BuildNotFoundEmbed(string query)
        {
            EmbedBuilder embed = new()
            {
                Title = "🔌 Plugin Not Found",
                Description = $"Could not find a plugin matching **{query}**",
                Color = new Color(0xE74C3C)
            };

            embed.AddField("💡 Suggestions",
                "• Try a different search term\n" +
                "• Check the spelling\n" +
                "• Visit the [Plugins List](https://github.com/Purple-EyeZ/Plugins-List) for more options",
                inline: false);

            embed.Footer = new EmbedFooterBuilder
            {
                Text = "Plugin database is updated regularly"
            };

            return embed.Build();
        }

        private static string GetStatusEmoji(string status)
        {
            return status?.ToUpperInvariant() switch
            {
                "working" => "✅",
                "warning" => "⚠️",
                "broken" => "❌",
                _ => "❓"
            };
        }

        private static Color GetStatusColor(string status)
        {
            return status?.ToUpperInvariant() switch
            {
                "working" => new Color(0x27AE60),      // Green
                "warning" => new Color(0xF39C12),      // Orange
                "broken" => new Color(0xE74C3C),       // Red
                _ => new Color(0x3498DB)                // Blue
            };
        }
    }
}
