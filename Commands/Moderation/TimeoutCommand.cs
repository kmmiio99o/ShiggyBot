using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    public class TimeoutCommand : ICommand
    {
        public string Name => "timeout";
        public string Description => "Timeout a user for a specified duration";
        public string Category => "Moderation";
        public string[] Aliases => new string[0];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server."));
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.ModerateMembers)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need ModerateMembers permission to use this command."));
                return;
            }

            if (args.Length < 2)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🛡️ Timeout Command",
                    Description = "Temporarily mute a user from chatting",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`timeout <user> <duration> [reason]`", inline: false);
                usageEmbed.AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days", inline: false);
                usageEmbed.AddField("Example", "`timeout @user 10m Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            var userArg = args[0];
            var durationArg = args[1];
            var reason = args.Length > 2 ? string.Join(" ", args, 2, args.Length - 2) : "No reason provided";

            var guild = guildChannel.Guild;
            var userId = EmbedHelper.ParseUserMention(userArg);
            var user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString() == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found."));
                return;
            }

            TimeSpan duration = TimeSpan.FromMinutes(5); // default
            if (durationArg.EndsWith("s")) duration = TimeSpan.FromSeconds(int.Parse(durationArg.TrimEnd('s')));
            else if (durationArg.EndsWith("m")) duration = TimeSpan.FromMinutes(int.Parse(durationArg.TrimEnd('m')));
            else if (durationArg.EndsWith("h")) duration = TimeSpan.FromHours(int.Parse(durationArg.TrimEnd('h')));
            else if (durationArg.EndsWith("d")) duration = TimeSpan.FromDays(int.Parse(durationArg.TrimEnd('d')));

            try
            {
                await user.SetTimeOutAsync(duration, new RequestOptions { AuditLogReason = reason });
                var embed = new EmbedBuilder
                {
                    Title = "🛡️ User Timed Out",
                    Color = new Color(0xFFA500),
                    ThumbnailUrl = user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl()
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.AddField("Duration", $"{duration.TotalMinutes} minute(s)", inline: true);
                embed.AddField("Reason", reason, inline: false);
                embed.WithFooter("Timeout action completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build());
            }
            catch
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to timeout user. Check role hierarchy."));
            }
        }
    }
}
