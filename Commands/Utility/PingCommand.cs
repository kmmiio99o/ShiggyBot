using Discord.WebSocket;
using ShiggyBot.Components.V1;

namespace ShiggyBot.Commands.Utility
{
    internal sealed class PingCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal PingCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "ping";

        public string Description => "Check bot latency and response time";

        public string Category => "Utility";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(client);

            int latency = client.Latency;

            V1MessageBuilder builder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("Pong")
                    .WithDescription($"Latency: {latency} ms")
                    .WithColor(0x00FF00));

            await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }
    }
}
