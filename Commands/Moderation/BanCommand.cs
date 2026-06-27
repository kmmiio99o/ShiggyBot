using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class BanCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;
        private readonly DatabaseService _db;

        internal BanCommand(ComponentsV1Client v1Client, DatabaseService db)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            ArgumentNullException.ThrowIfNull(db);
            _v1Client = v1Client;
            _db = db;
        }

        public string Name => "ban";

        public string Description => "Ban a user from the server (supports timed bans)";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.BanMembers).ConfigureAwait(false))
            {
                return;
            }

            SocketGuildChannel guildChannel = (SocketGuildChannel)message.Channel;
            SocketGuild guild = guildChannel.Guild;

            IGuildUser? user = message.ReferencedMessage is not null
                ? await PermissionHelper.ResolveRepliedUserAsync(guild, message).ConfigureAwait(false)
                : null;

            int offset = user is not null ? 0 : 1;

            if (args.Length < offset)
            {
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Ban Command")
                        .WithDescription("Permanently ban a user from the server")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`ban <user> [duration] [reason]`", false)
                        .AddField("Reply Usage", "Reply to a message with `ban [duration] [reason]`", false)
                        .AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days (optional)", false)
                        .AddField("Example", "`ban @user 7d Breaking rules`", false));

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

            int deleteDays = 0;

            TimeSpan? duration = null;
            int reasonStart = offset;
            if (args.Length > offset && TryParseDuration(args[offset], out TimeSpan parsedDuration))
            {
                duration = parsedDuration;
                reasonStart = offset + 1;
            }

            string reason = args.Length > reasonStart ? string.Join(" ", args, reasonStart, args.Length - reasonStart) : "No reason provided";

            try
            {
                await user.BanAsync(deleteDays, reason).ConfigureAwait(false);

                if (duration.HasValue)
                {
                    DateTime unbanTime = DateTime.UtcNow.Add(duration.Value);
                    await _db.AddTimedBanAsync(guild.Id, user.Id, unbanTime, reason, message.Author.Id).ConfigureAwait(false);
                }

                V1EmbedBuilder embed = new V1EmbedBuilder()
                    .WithTitle("🛡️ User Banned")
                    .WithColor(0xFF0000)
                    .WithThumbnail(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl())
                    .AddField("User", $"{user.Username}#{user.Discriminator}", true)
                    .AddField("Moderator", message.Author.Username, true)
                    .AddField("Reason", reason, false);

                if (duration.HasValue)
                {
                    embed.AddField("Duration", $"{duration.Value.TotalDays} day(s)", true);
                }

                embed.AddField("Delete Messages", $"Last {deleteDays} day(s)", true);
                embed.WithFooter("Ban action completed");
                embed.WithTimestamp(DateTimeOffset.UtcNow);

                V1MessageBuilder builder = new V1MessageBuilder().AddEmbed(embed);
                await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Failed to ban user. Check role hierarchy.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
        }

        private static bool TryParseDuration(string input, out TimeSpan duration)
        {
            duration = TimeSpan.Zero;
            if (string.IsNullOrEmpty(input))
            {
                return false;
            }

            try
            {
                if (input.EndsWith('s'))
                {
                    duration = TimeSpan.FromSeconds(int.Parse(input.TrimEnd('s'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('m'))
                {
                    duration = TimeSpan.FromMinutes(int.Parse(input.TrimEnd('m'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('h'))
                {
                    duration = TimeSpan.FromHours(int.Parse(input.TrimEnd('h'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('d'))
                {
                    duration = TimeSpan.FromDays(int.Parse(input.TrimEnd('d'), CultureInfo.InvariantCulture));
                }
                else
                {
                    return false;
                }
                return true;
            }
            catch (FormatException)
            {
                return false;
            }
        }
    }
}
