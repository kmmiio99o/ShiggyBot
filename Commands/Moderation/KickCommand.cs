using System.Globalization;
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

            if (args.Length == 0)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Kick Command",
                    Description = "Remove a user from the server temporarily",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`kick <user> [reason]`", inline: false);
                usageEmbed.AddField("Example", "`kick @user Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            string userArg = args[0];
            string reason = args.Length > 1 ? string.Join(" ", args, 1, args.Length - 1) : "No reason provided";

            SocketGuild guild = guildChannel.Guild;
            ulong? userId = EmbedHelper.ParseUserMention(userArg);
            SocketGuildUser? user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString(CultureInfo.InvariantCulture) == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found.")).ConfigureAwait(false);
                return;
            }

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
