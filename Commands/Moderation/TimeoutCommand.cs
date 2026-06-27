using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class TimeoutCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal TimeoutCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "timeout";

        public string Description => "Timeout a user for a specified duration";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

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
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Timeout Command")
                        .WithDescription("Temporarily mute a user from chatting")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`timeout <user> <duration> [reason]`", false)
                        .AddField("Reply Usage", "Reply to a message with `timeout <duration> [reason]`", false)
                        .AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days", false)
                        .AddField("Example", "`timeout @user 10m Breaking rules`", false));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            if (offset == 1)
            {
                user = await PermissionHelper.ResolveUserAsync(guild, args[0]).ConfigureAwait(false);
            }

            if (user == null)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("User not found.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
                return;
            }

            string durationArg = args[offset];
            string reason = args.Length > offset + 1 ? string.Join(" ", args, offset + 1, args.Length - (offset + 1)) : "No reason provided";

            TimeSpan duration = TimeSpan.FromMinutes(5);
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

                V1MessageBuilder builder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ User Timed Out")
                        .WithColor(0xFFA500)
                        .WithThumbnail(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl())
                        .AddField("User", $"{user.Username}#{user.Discriminator}", true)
                        .AddField("Moderator", message.Author.Username, true)
                        .AddField("Duration", $"{duration.TotalMinutes} minute(s)", true)
                        .AddField("Reason", reason, false)
                        .WithFooter("Timeout action completed")
                        .WithTimestamp(DateTimeOffset.UtcNow));

                await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Failed to timeout user. Check role hierarchy.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
        }
    }
}
