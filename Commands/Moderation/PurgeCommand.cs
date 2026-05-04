using System;
using System.Linq;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    public class PurgeCommand : ICommand
    {
        public string Name => "purge";
        public string Description => "Delete multiple messages from a channel";
        public string Category => "Moderation";
        public string[] Aliases => new string[0];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (message.Channel is not SocketGuildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server."));
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.ManageMessages)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need ManageMessages permission to use this command."));
                return;
            }

            if (args.Length == 0 || !int.TryParse(args[0], out int count) || count < 1 || count > 100)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🛡️ Purge Command",
                    Description = "Delete multiple messages from the channel",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`purge <count>` (1-100)", inline: false);
                usageEmbed.AddField("Example", "`purge 50`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            var messages = await message.Channel.GetMessagesAsync(count).FlattenAsync();
            var filtered = messages.Where(m => (DateTimeOffset.UtcNow - m.Timestamp).TotalDays < 14).ToList();

            if (filtered.Count == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("No deletable messages found."));
                return;
            }

            await ((ITextChannel)message.Channel).DeleteMessagesAsync(filtered);
            var embed = new EmbedBuilder
            {
                Title = "🛡️ Messages Purged",
                Color = new Color(0x00FF00)
            };
            embed.AddField("Deleted", $"{filtered.Count} message(s)", inline: true);
            embed.AddField("Channel", message.Channel.Name, inline: true);
            embed.AddField("Moderator", message.Author.Username, inline: true);
            embed.WithFooter("Purge action completed");
            embed.WithCurrentTimestamp();
            await message.Channel.SendMessageAsync(embed: embed.Build());
        }
    }
}
