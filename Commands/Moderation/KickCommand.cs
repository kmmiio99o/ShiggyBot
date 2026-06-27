using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class KickCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal KickCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "kick";

        public string Description => "Kick a user from the server";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.KickMembers).ConfigureAwait(false))
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
                        .WithTitle("🛡️ Kick Command")
                        .WithDescription("Remove a user from the server temporarily")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`kick <user> [reason]`", false)
                        .AddField("Reply Usage", "Reply to a message with `kick [reason]`", false)
                        .AddField("Example", "`kick @user Breaking rules`", false));

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

            string reason = args.Length > offset ? string.Join(" ", args, offset, args.Length - offset) : "No reason provided";

            try
            {
                await user.KickAsync(reason).ConfigureAwait(false);

                V1MessageBuilder builder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ User Kicked")
                        .WithColor(0xFFA500)
                        .WithThumbnail(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl())
                        .AddField("User", $"{user.Username}#{user.Discriminator}", true)
                        .AddField("Moderator", message.Author.Username, true)
                        .AddField("Reason", reason, false)
                        .WithFooter("Kick action completed")
                        .WithTimestamp(DateTimeOffset.UtcNow));

                await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Failed to kick user. Check role hierarchy.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
        }
    }
}
