using System.Globalization;
using Discord.WebSocket;
using ShiggyBot.Components.V2;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    /// <summary>
    /// Command to timeout a user for a specified duration.
    /// </summary>
    internal sealed class TimeoutCommand : ICommand
    {
        private readonly ComponentsV2Client _v2Client;

        /// <summary>
        /// Initializes a new instance of the <see cref="TimeoutCommand"/> class.
        /// </summary>
        /// <param name="v2Client">The Components V2 client.</param>
        internal TimeoutCommand(ComponentsV2Client v2Client)
        {
            ArgumentNullException.ThrowIfNull(v2Client);
            _v2Client = v2Client;
        }

        /// <summary>Gets the command name.</summary>
        public string Name => "timeout";

        /// <summary>Gets the command description.</summary>
        public string Description => "Timeout a user for a specified duration";

        /// <summary>Gets the command category.</summary>
        public string Category => "Moderation";

        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => [];

        /// <summary>Executes the command.</summary>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, global::Discord.GuildPermission.ModerateMembers).ConfigureAwait(false))
            {
                return;
            }

            SocketGuildChannel guildChannel = (SocketGuildChannel)message.Channel;
            SocketGuild guild = guildChannel.Guild;

            global::Discord.IGuildUser? user = message.ReferencedMessage is not null
                ? await PermissionHelper.ResolveRepliedUserAsync(guild, message).ConfigureAwait(false)
                : null;

            int offset = user is not null ? 0 : 1;

            if (args.Length < offset + 1)
            {
                await SendUsageAsync(message).ConfigureAwait(false);
                return;
            }

            if (offset == 1)
            {
                user = await PermissionHelper.ResolveUserAsync(guild, args[0]).ConfigureAwait(false);
            }

            if (user is null)
            {
                await SendErrorAsync(message, "User not found.").ConfigureAwait(false);
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
                await user.SetTimeOutAsync(duration, new global::Discord.RequestOptions { AuditLogReason = reason }).ConfigureAwait(false);

                string avatarUrl = user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl();

                V2MessageBuilder builder = new V2MessageBuilder()
                    .AddComponent(new ContainerBuilder()
                        .WithAccentColor(0xFFA500)
                        .AddComponent(new SectionBuilder()
                            .AddTextDisplay(new TextDisplayBuilder().WithContent("# \uD83D\uDEE1\uFE0F User Timed Out"))
                            .WithThumbnailAccessory(new ThumbnailBuilder()
                                .WithMedia(new Uri(avatarUrl))
                                .WithDescription("User avatar")))
                        .AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small))
                        .AddComponent(new TextDisplayBuilder().WithContent(
                            "**User:** " + user.Mention + "\n" +
                            "**Moderator:** " + message.Author.Username + "\n" +
                            "**Duration:** " + duration.TotalMinutes + " minute(s)\n" +
                            "**Reason:** " + reason))
                        .AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small))
                        .AddComponent(new TextDisplayBuilder().WithContent("*Timeout action completed*")));

                await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await SendErrorAsync(message, "Failed to timeout user. Check role hierarchy.").ConfigureAwait(false);
            }
        }

        private async Task SendUsageAsync(SocketUserMessage message)
        {
            V2MessageBuilder builder = new V2MessageBuilder()
                .AddComponent(new ContainerBuilder()
                    .WithAccentColor(0xFFA500)
                    .AddComponent(new TextDisplayBuilder().WithContent(
                        "# \uD83D\uDEE1\uFE0F Timeout Command\n\n" +
                        "Temporarily mute a user from chatting\n\n" +
                        "## Usage\n" +
                        "`timeout <user> <duration> [reason]`\n\n" +
                        "## Reply Usage\n" +
                        "Reply to a message with `timeout <duration> [reason]`\n\n" +
                        "## Duration Format\n" +
                        "\uD83D\uDD52 s = seconds, m = minutes, h = hours, d = days\n\n" +
                        "## Example\n" +
                        "`timeout @user 10m Breaking rules`")));

            await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }

        private async Task SendErrorAsync(SocketUserMessage message, string error)
        {
            V2MessageBuilder builder = new V2MessageBuilder()
                .AddComponent(new ContainerBuilder()
                    .WithAccentColor(0xE74C3C)
                    .AddComponent(new TextDisplayBuilder().WithContent("# Error\n\n" + error)));

            await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }
    }
}
