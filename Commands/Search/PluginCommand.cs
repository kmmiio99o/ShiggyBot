using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Services;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Search
{
    public class PluginCommand : ICommand
    {
        private readonly PluginService _pluginService;

        public string Name => "plugin";
        public string Description => "Search for Discord plugins and extensions";
        public string Category => "Search";
        public string[] Aliases => new[] { "plugins", "plg", "plug" };

        public PluginCommand(PluginService pluginService)
        {
            _pluginService = pluginService ?? throw new ArgumentNullException(nameof(pluginService));
        }

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            try
            {
                // Validate arguments
                if (args.Length == 0)
                {
                    var errEmbed = new EmbedBuilder
                    {
                        Title = "Error",
                        Description = "Please provide a plugin name to search.",
                        Color = new Color(0xE74C3C)
                    };
                    errEmbed.AddField("Usage", "`plugin <name>`", inline: false);
                    await message.Channel.SendMessageAsync(embed: errEmbed.Build());
                    return;
                }

                // Search for plugin
                var query = string.Join(" ", args);
                var searchEmbed = new EmbedBuilder
                {
                    Title = "🔌 Plugin Search",
                    Description = $"Searching for: **{query}**",
                    Color = new Color(0x3498DB)
                };
                searchEmbed.AddField("Status", "⏳ Searching...", inline: false);
                var statusMessage = await message.Channel.SendMessageAsync(embed: searchEmbed.Build());

                try
                {
                    var result = await _pluginService.SearchPluginAsync(query);

                    if (result != null)
                    {
                        await statusMessage.DeleteAsync();
                        // Register ephemeral install handler for this result
                        EphemeralButtonService.Register($"plugin_install_{result.Name}", async (component) =>
                        {
                            if (string.IsNullOrWhiteSpace(result.InstallUrl))
                            {
                                await component.RespondAsync("Install link not available.", ephemeral: true);
                                return;
                            }
                            var embed = new EmbedBuilder
                            {
                                Title = $"📥 Install {result.Name}",
                                Description = $"[Click here to install]({result.InstallUrl})",
                                Color = new Color(0x27AE60),
                                Url = result.InstallUrl
                            };
                            embed.Footer = new EmbedFooterBuilder { Text = "This message is only visible to you" };
                            await component.RespondAsync(embed: embed.Build(), ephemeral: true);
                        });
                        await HandleSuccessfulSearchAsync(message, result);
                    }
                    else
                    {
                        await statusMessage.ModifyAsync(x => x.Embed = BuildNotFoundEmbed(query));
                    }
                }
                catch (Exception ex)
                {
                    await statusMessage.ModifyAsync(x => x.Embed =
                        EmbedHelper.BuildErrorEmbed($"Search failed: {ex.Message}"));
                }
            }
            catch (Exception ex)
            {
                await message.Channel.SendMessageAsync(
                    embed: EmbedHelper.BuildErrorEmbed($"An error occurred: {ex.Message}"));
            }
        }

        private async Task HandleSuccessfulSearchAsync(SocketUserMessage message, PluginResult result)
        {
            var embed = new EmbedBuilder
            {
                Title = $"🔌 {result.Name}",
                Description = result.Description,
                Color = GetStatusColor(result.Status)
            };

            // Add status field with emoji
            var statusEmoji = GetStatusEmoji(result.Status);
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
            var componentBuilder = new ComponentBuilder();

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
            await message.Channel.SendMessageAsync(embed: embed.Build(), components: componentBuilder.Build());
        }

        private Embed BuildNotFoundEmbed(string query)
        {
            var embed = new EmbedBuilder
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

        private string GetStatusEmoji(string status)
        {
            return status?.ToLower() switch
            {
                "working" => "✅",
                "warning" => "⚠️",
                "broken" => "❌",
                _ => "❓"
            };
        }

        private Color GetStatusColor(string status)
        {
            return status?.ToLower() switch
            {
                "working" => new Color(0x27AE60),      // Green
                "warning" => new Color(0xF39C12),      // Orange
                "broken" => new Color(0xE74C3C),       // Red
                _ => new Color(0x3498DB)                // Blue
            };
        }
    }
}
