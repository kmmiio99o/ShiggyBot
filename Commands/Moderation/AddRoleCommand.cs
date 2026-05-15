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

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.ManageRoles).ConfigureAwait(false))
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
                    Title = "🛡️ Add Role Command",
                    Description = "Add a role to a server member",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`addrole <user> <role>`", inline: false);
                usageEmbed.AddField("Reply Usage", "Reply to a message with `addrole <role>`", inline: false);
                usageEmbed.AddField("Example", "`addrole @user Member`", inline: false);
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

            string roleArg = string.Join(" ", args, offset, args.Length - offset);
            SocketRole? role = PermissionHelper.ResolveRole(guild, roleArg);

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
