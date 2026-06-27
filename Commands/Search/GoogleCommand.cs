using Discord.WebSocket;
using ShiggyBot.Components.V1;

namespace ShiggyBot.Commands.Search
{
    internal sealed class GoogleCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal GoogleCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "google";

        public string Description => "Search Google directly from Discord";

        public string Category => "Search";

        public IReadOnlyList<string> Aliases => ["g", "search"];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            ArgumentNullException.ThrowIfNull(client);

            if (args.Length == 0)
            {
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Usage: google <query>")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            string query = string.Join(" ", args);
            string url = $"https://www.google.com/search?q={Uri.EscapeDataString(query)}";

            V1MessageBuilder builder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("🔍 Google Search")
                    .WithDescription($"**Query:** {query}")
                    .WithColor(0x00FF00)
                    .WithUrl(url)
                    .AddField("Link", url));

            await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }
    }
}
