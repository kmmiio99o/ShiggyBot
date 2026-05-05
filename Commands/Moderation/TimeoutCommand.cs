using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class TimeoutCommand : ICommand
    {
        public string Name => "timeout";
        public string Description => "Timeout a user for a specified duration";
        public string Category => "Moderation";
        public string[] Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server.")).ConfigureAwait(false);
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.ModerateMembers)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need ModerateMembers permission to use this command.")).ConfigureAwait(false);
                return;
            }

            if (args.Length < 2)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Timeout Command",
                    Description = "Temporarily mute a user from chatting",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`timeout <user> <duration> [reason]`", inline: false);
                usageEmbed.AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days", inline: false);
                usageEmbed.AddField("Example", "`timeout @user 10m Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            string userArg = args[0];
            string durationArg = args[1];
            string reason = args.Length > 2 ? string.Join(" ", args, 2, args.Length - 2) : "No reason provided";

            SocketGuild guild = guildChannel.Guild;
            ulong? userId = EmbedHelper.ParseUserMention(userArg);
            SocketGuildUser? user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString(CultureInfo.InvariantCulture) == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found.")).ConfigureAwait(false);
                return;
            }

            TimeSpan duration = TimeSpan.FromMinutes(5); // default
            if (durationArg.EndsWith('s'))
            {
                duration = TimeSpan.FromSeconds(int.Parse(durationArg.TrimEnd('s'), CultureInfo.InvariantCulture));
            }
            else if (durationArg.EndsWith('m'))
            {
                duration = TimeSpan.FromMinutes(int.Parse(durationArg.TrimEnd('m'), CultureInfo.InvariantCulture));
            }
            else if (durationArg.EndsWith('h'))
            {
                duration = TimeSpan.FromHours(int.Parse(durationArg.TrimEnd('h'), CultureInfo.InvariantCulture));
            }
            else if (durationArg.EndsWith('d'))
            {
                duration = TimeSpan.FromDays(int.Parse(durationArg.TrimEnd('d'), CultureInfo.InvariantCulture));
            }

            try
            {
                await user.SetTimeOutAsync(duration, new RequestOptions { AuditLogReason = reason }).ConfigureAwait(false);
                EmbedBuilder embed = new()
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
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to timeout user. Check role hierarchy.")).ConfigureAwait(false);
            }
        }
    }
}
