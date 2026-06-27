using System.Text;
using Discord.WebSocket;
using ShiggyBot.Components.V2;
using ShiggyBot.Services;

namespace ShiggyBot.Commands.Search
{
    /// <summary>
    /// Command to search for Discord plugins and extensions.
    /// </summary>
    internal sealed class PluginCommand : ICommand
    {
        private readonly PluginService _pluginService;
        private readonly ComponentsV2Client _v2Client;

        /// <summary>
        /// Initializes a new instance of the <see cref="PluginCommand"/> class.
        /// </summary>
        /// <param name="pluginService">The plugin search service.</param>
        /// <param name="v2Client">The Components V2 client.</param>
        internal PluginCommand(PluginService pluginService, ComponentsV2Client v2Client)
        {
            ArgumentNullException.ThrowIfNull(pluginService);
            ArgumentNullException.ThrowIfNull(v2Client);
            _pluginService = pluginService;
            _v2Client = v2Client;
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
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (args.Length == 0)
            {
                await SendErrorAsync(message, "Please provide a plugin name to search.", "Usage: `plugin <name>`").ConfigureAwait(false);
                return;
            }

            string query = string.Join(" ", args);

            PluginResult? result;
            try
            {
                result = await _pluginService.SearchPluginAsync(query).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                await SendErrorAsync(message, "Search failed: " + ex.Message).ConfigureAwait(false);
                return;
            }
            catch (TaskCanceledException ex)
            {
                await SendErrorAsync(message, "Search timed out: " + ex.Message).ConfigureAwait(false);
                return;
            }

            if (result is null)
            {
                await SendNotFoundAsync(message, query).ConfigureAwait(false);
                return;
            }

            await SendSuccessAsync(message, result).ConfigureAwait(false);
        }

        private async Task SendErrorAsync(SocketUserMessage message, string error, string? usage = null)
        {
            V2MessageBuilder builder = new V2MessageBuilder()
                .AddComponent(new ContainerBuilder()
                    .WithAccentColor(0xE74C3C)
                    .AddComponent(new TextDisplayBuilder().WithContent("# Error\n\n" + error)));

            if (usage is not null)
            {
                builder.AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small));
                builder.AddComponent(new TextDisplayBuilder().WithContent("## Usage\n\n" + usage));
            }

            await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }

        private async Task SendSuccessAsync(SocketUserMessage message, PluginResult result)
        {
            string statusEmoji = GetStatusEmoji(result.Status);
            int statusColor = GetStatusColorInt(result.Status);
            bool hasSource = !string.IsNullOrWhiteSpace(result.SourceUrl);
            bool hasInstall = !string.IsNullOrWhiteSpace(result.InstallUrl);

            if (hasInstall)
            {
                string capturedUrl = result.InstallUrl;
                string capturedName = result.Name;
                EphemeralButtonService.Register($"plugin_install_{result.Name}", async (component) =>
                {
                    await component.RespondAsync(
                        text: "\U0001f4e5 **" + capturedName + "** install link:\n" + capturedUrl,
                        ephemeral: true).ConfigureAwait(false);
                });
            }

            ContainerBuilder container = new ContainerBuilder()
                .WithAccentColor(statusColor);

            StringBuilder content = new();
            content.Append("# \U0001f50c ");
            content.Append(result.Name);
            content.Append("\n\n");
            content.Append(result.Description);
            content.Append("\n\n## Status\n");
            content.Append(statusEmoji);
            content.Append(" **");
            content.Append(result.Status);
            content.Append("**");

            if (result.Authors.Count > 0)
            {
                content.Append("\n\n\U0001f464 **Authors:** ");
                content.Append(string.Join(", ", result.Authors));
            }

            if (!string.IsNullOrWhiteSpace(result.WarningMessage))
            {
                content.Append("\n\n\u26a0\ufe0f **Warning:** ");
                content.Append(result.WarningMessage);
            }

            container.AddComponent(new TextDisplayBuilder().WithContent(content.ToString()));

            if (hasSource)
            {
                container.AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small));
                container.AddComponent(new SectionBuilder()
                    .AddTextDisplay(new TextDisplayBuilder().WithContent("Source code available on GitHub"))
                    .WithLinkButtonAccessory("\U0001f4c2 Source", new Uri(result.SourceUrl)));
            }

            if (hasInstall)
            {
                container.AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small));
                container.AddComponent(new SectionBuilder()
                    .AddTextDisplay(new TextDisplayBuilder().WithContent("Click to get the install link"))
                    .WithButtonAccessory("\U0001f4e5 Install", "plugin_install_" + result.Name));
            }

            V2MessageBuilder builder = new();
            builder.AddComponent(container);
            await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }

        private async Task SendNotFoundAsync(SocketUserMessage message, string query)
        {
            V2MessageBuilder builder = new V2MessageBuilder()
                .AddComponent(new SectionBuilder()
                    .AddTextDisplay(new TextDisplayBuilder().WithContent(
                        "# \U0001f50c Plugin Not Found\n\nCould not find a plugin matching **" + query + "**\n\n\U0001f4a1 **Suggestions**\n\u2022 Try a different search term\n\u2022 Check the spelling\n\u2022 Visit the Plugins List for more options"))
                    .WithLinkButtonAccessory("Plugins List", new Uri("https://plugins-list.pages.dev/")));

            await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }

        private static string GetStatusEmoji(string status)
        {
            return status?.ToUpperInvariant() switch
            {
                "WORKING" => "\u2705",
                "WARNING" => "\u26a0\ufe0f",
                "BROKEN" => "\u274c",
                _ => "\u2753"
            };
        }

        private static int GetStatusColorInt(string status)
        {
            return status?.ToUpperInvariant() switch
            {
                "WORKING" => 0x27AE60,
                "WARNING" => 0xF39C12,
                "BROKEN" => 0xE74C3C,
                _ => 0x3498DB
            };
        }
    }
}
