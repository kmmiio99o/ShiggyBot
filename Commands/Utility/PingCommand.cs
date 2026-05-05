using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to check bot latency and response time.
    /// </summary>
    internal sealed class PingCommand : ICommand
    {
        /// <summary>
        /// Gets the name of the command.
        /// </summary>
        public string Name => "ping";

        /// <summary>
        /// Gets the description of the command.
        /// </summary>
        public string Description => "Check bot latency and response time";

        /// <summary>
        /// Gets the category of the command.
        /// </summary>
        public string Category => "Utility";

        /// <summary>
        /// Gets the aliases for the command.
        /// </summary>
        public string[] Aliases => ["sping"];

        /// <summary>
        /// Executes the ping command.
        /// </summary>
        /// <param name="message">The user message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(client);

            int latency = client.Latency;
            Embed embed = EmbedHelper.BuildPingEmbed(latency);
            await message.Channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
        }
    }
}
