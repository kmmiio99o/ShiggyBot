using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class KickCommand : ICommand
    {
        public string Name => "kick";
        public string Description => "Kick a user from the server";
        public string Category => "Moderation";
        public string[] Aliases => [];

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
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Kick Command",
                    Description = "Remove a user from the server temporarily",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`kick <user> [reason]`", inline: false);
                usageEmbed.AddField("Reply Usage", "Reply to a message with `kick [reason]`", inline: false);
                usageEmbed.AddField("Example", "`kick @user Breaking rules`", inline: false);
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

            string reason = args.Length > offset ? string.Join(" ", args, offset, args.Length - offset) : "No reason provided";

            try
            {
                await user.KickAsync(reason).ConfigureAwait(false);
                EmbedBuilder embed = new()
                {
                    Title = "🛡️ User Kicked",
                    Color = new Color(0xFFA500),
                    ThumbnailUrl = user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl()
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.AddField("Reason", reason, inline: false);
                embed.WithFooter("Kick action completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to kick user. Check role hierarchy.")).ConfigureAwait(false);
            }
        }
    }
}
