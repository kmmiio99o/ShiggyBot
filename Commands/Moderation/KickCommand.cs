using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    public class KickCommand : ICommand
    {
        public string Name => "kick";
        public string Description => "Kick a user from the server";
        public string Category => "Moderation";
        public string[] Aliases => new string[0];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server."));
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.KickMembers)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need KickMembers permission to use this command."));
                return;
            }

            if (args.Length == 0)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🛡️ Kick Command",
                    Description = "Remove a user from the server temporarily",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`kick <user> [reason]`", inline: false);
                usageEmbed.AddField("Example", "`kick @user Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            var userArg = args[0];
            var reason = args.Length > 1 ? string.Join(" ", args, 1, args.Length - 1) : "No reason provided";

            var guild = guildChannel.Guild;
            var userId = EmbedHelper.ParseUserMention(userArg);
            var user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString() == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found."));
                return;
            }

            try
            {
                await user.KickAsync(reason);
                var embed = new EmbedBuilder
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
                await message.Channel.SendMessageAsync(embed: embed.Build());
            }
            catch
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to kick user. Check role hierarchy."));
            }
        }
    }
}
