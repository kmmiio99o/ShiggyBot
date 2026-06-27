using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class PurgeCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal PurgeCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "purge";

        public string Description => "Delete multiple messages from a channel";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.ManageMessages).ConfigureAwait(false))
            {
                return;
            }

            if (args.Length == 0 || !int.TryParse(args[0], out int count) || count < 1 || count > 100)
            {
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Purge Command")
                        .WithDescription("Delete multiple messages from the channel")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`purge <count>` (1-100)", false)
                        .AddField("Example", "`purge 50`", false));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            IEnumerable<IMessage> messages = await message.Channel.GetMessagesAsync(count).FlattenAsync().ConfigureAwait(false);
            List<IMessage> filtered = [.. messages.Where(m => (DateTimeOffset.UtcNow - m.Timestamp).TotalDays < 14)];

            if (filtered.Count == 0)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("No deletable messages found.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
                return;
            }

            await ((ITextChannel)message.Channel).DeleteMessagesAsync(filtered).ConfigureAwait(false);

            V1MessageBuilder builder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("🛡️ Messages Purged")
                    .WithColor(0x00FF00)
                    .AddField("Deleted", $"{filtered.Count} message(s)", true)
                    .AddField("Channel", message.Channel.Name, true)
                    .AddField("Moderator", message.Author.Username, true)
                    .WithFooter("Purge action completed")
                    .WithTimestamp(DateTimeOffset.UtcNow));

            await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }
    }
}
