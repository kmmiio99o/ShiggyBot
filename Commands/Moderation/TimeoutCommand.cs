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

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.ModerateMembers).ConfigureAwait(false))
            {
                return;
            }

            SocketGuildChannel guildChannel = (SocketGuildChannel)message.Channel;
            SocketGuild guild = guildChannel.Guild;

            IGuildUser? user = message.ReferencedMessage is not null
                ? await PermissionHelper.ResolveRepliedUserAsync(guild, message).ConfigureAwait(false)
                : null;

            int offset = user is not null ? 0 : 1;

            if (args.Length < offset + 1)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Timeout Command",
                    Description = "Temporarily mute a user from chatting",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`timeout <user> <duration> [reason]`", inline: false);
                usageEmbed.AddField("Reply Usage", "Reply to a message with `timeout <duration> [reason]`", inline: false);
                usageEmbed.AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days", inline: false);
                usageEmbed.AddField("Example", "`timeout @user 10m Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            if (offset == 1)
            {
                user = await PermissionHelper.ResolveUserAsync(guild, args[0]).ConfigureAwait(false);
            }

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found.")).ConfigureAwait(false);
                return;
            }

            string durationArg = args[offset];
            string reason = args.Length > offset + 1 ? string.Join(" ", args, offset + 1, args.Length - (offset + 1)) : "No reason provided";

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
