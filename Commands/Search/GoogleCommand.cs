using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Search
{
    /// <summary>
    /// Command to search Google directly from Discord.
    /// </summary>
    internal sealed class GoogleCommand : ICommand
    {
        /// <summary>Gets the command name.</summary>
        public string Name => "google";

        /// <summary>Gets the command description.</summary>
        public string Description => "Search Google directly from Discord";

        /// <summary>Gets the command category.</summary>
        public string Category => "Search";

        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => ["g", "search"];

        /// <summary>Executes the command.</summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            ArgumentNullException.ThrowIfNull(client);

            if (args.Length == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Usage: google <query>")).ConfigureAwait(false);
                return;
            }

            string query = string.Join(" ", args);
            string url = $"https://www.google.com/search?q={Uri.EscapeDataString(query)}";

            EmbedBuilder embed = new()
            {
                Title = "🔍 Google Search",
                Description = $"**Query:** {query}",
                Color = new Color(0x00FF00),
                Url = url
            };
            embed.AddField("Link", url);

            await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
        }
    }
}
