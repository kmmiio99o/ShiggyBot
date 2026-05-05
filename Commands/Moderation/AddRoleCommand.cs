using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class AddRoleCommand : ICommand
    {
        public string Name => "addrole";
        public string Description => "Add a role to a user";
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

            if (!((SocketGuildUser)message.Author).GuildPermissions.ManageRoles)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need ManageRoles permission to use this command.")).ConfigureAwait(false);
                return;
            }

            if (args.Length < 2)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Add Role Command",
                    Description = "Add a role to a server member",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`addrole <user> <role>`", inline: false);
                usageEmbed.AddField("Example", "`addrole @user Member`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            string userArg = args[0];
            string roleArg = string.Join(" ", args, 1, args.Length - 1);
            SocketGuild guild = guildChannel.Guild;

            ulong? userId = EmbedHelper.ParseUserMention(userArg);
            SocketGuildUser? user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString(CultureInfo.InvariantCulture) == userArg);
            SocketRole? role = guild.Roles.FirstOrDefault(r => r.Name == roleArg || r.Id.ToString(CultureInfo.InvariantCulture) == roleArg || r.Mention == roleArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found.")).ConfigureAwait(false);
                return;
            }

            if (role == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Role not found.")).ConfigureAwait(false);
                return;
            }

            try
            {
                await user.AddRoleAsync(role).ConfigureAwait(false);
                EmbedBuilder embed = new()
                {
                    Title = "🛡️ Role Added",
                    Color = new Color(0x00FF00)
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Role", role.Name, inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.WithFooter("Role assignment completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to add role. Check role hierarchy.")).ConfigureAwait(false);
            }
            catch (TaskCanceledException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Request timed out. Try again.")).ConfigureAwait(false);
            }
        }
    }
}
