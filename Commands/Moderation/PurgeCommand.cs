using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    /// <summary>
    /// Command to bulk delete messages in a channel.
    /// </summary>
    internal sealed class PurgeCommand : ICommand
    {
        /// <summary>
        /// Gets the command name.
        /// </summary>
        public string Name => "purge";
        /// <summary>
        /// Gets the command description.
        /// </summary>
        public string Description => "Delete multiple messages from a channel";
        /// <summary>
        /// Gets the command category.
        /// </summary>
        public string Category => "Moderation";
        /// <summary>
        /// Gets the command aliases.
        /// </summary>
        public IReadOnlyList<string> Aliases => [];

        /// <summary>
        /// Executes the command.
        /// </summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
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
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Purge Command",
                    Description = "Delete multiple messages from the channel",
                    Color = new Color(0xFFA500)
                };
                _ = usageEmbed.AddField("Usage", "`purge <count>` (1-100)", inline: false);
                _ = usageEmbed.AddField("Example", "`purge 50`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            IEnumerable<IMessage> messages = await message.Channel.GetMessagesAsync(count).FlattenAsync().ConfigureAwait(false);
            List<IMessage> filtered = [.. messages.Where(m => (DateTimeOffset.UtcNow - m.Timestamp).TotalDays < 14)];

            if (filtered.Count == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("No deletable messages found.")).ConfigureAwait(false);
                return;
            }

            await ((ITextChannel)message.Channel).DeleteMessagesAsync(filtered).ConfigureAwait(false);
            EmbedBuilder embed = new()
            {
                Title = "🛡️ Messages Purged",
                Color = new Color(0x00FF00)
            };
            _ = embed.AddField("Deleted", $"{filtered.Count} message(s)", inline: true);
            _ = embed.AddField("Channel", message.Channel.Name, inline: true);
            _ = embed.AddField("Moderator", message.Author.Username, inline: true);
            embed.WithFooter("Purge action completed");
            embed.WithCurrentTimestamp();
            await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
        }
    }
}
