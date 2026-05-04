using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    public class RemoveRoleCommand : ICommand
    {
        public string Name => "removerole";
        public string Description => "Remove a role from a user";
        public string Category => "Moderation";
        public string[] Aliases => new string[0];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server."));
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.ManageRoles)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need ManageRoles permission to use this command."));
                return;
            }

            if (args.Length < 2)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🛡️ Remove Role Command",
                    Description = "Remove a role from a server member",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`removerole <user> <role>`", inline: false);
                usageEmbed.AddField("Example", "`removerole @user Member`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            var userArg = args[0];
            var roleArg = string.Join(" ", args, 1, args.Length - 1);
            var guild = guildChannel.Guild;

            var userId = EmbedHelper.ParseUserMention(userArg);
            var user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString() == userArg);
            var role = guild.Roles.FirstOrDefault(r => r.Name == roleArg || r.Id.ToString() == roleArg || r.Mention == roleArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found."));
                return;
            }

            if (role == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Role not found."));
                return;
            }

            try
            {
                await user.RemoveRoleAsync(role);
                var embed = new EmbedBuilder
                {
                    Title = "🛡️ Role Removed",
                    Color = new Color(0xFF0000)
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Role", role.Name, inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.WithFooter("Role removal completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build());
            }
            catch
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to remove role. Check role hierarchy."));
            }
        }
    }
}
