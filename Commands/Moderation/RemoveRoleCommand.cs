using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    /// <summary>
    /// Command to remove a role from a user.
    /// </summary>
    internal sealed class RemoveRoleCommand : ICommand
    {
        /// <summary>
        /// Gets the command name.
        /// </summary>
        public string Name => "removerole";
        /// <summary>
        /// Gets the command description.
        /// </summary>
        public string Description => "Remove a role from a user";
        /// <summary>
        /// Gets the command category.
        /// </summary>
        public string Category => "Moderation";
        /// <summary>
        /// Gets the command aliases.
        /// </summary>
        public IReadOnlyList<string> Aliases => [];

        /// <summary>
        /// Executes the command.
        /// </summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
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
                    Title = "🛡️ Remove Role Command",
                    Description = "Remove a role from a server member",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`removerole <user> <role>`", inline: false);
                usageEmbed.AddField("Reply Usage", "Reply to a message with `removerole <role>`", inline: false);
                usageEmbed.AddField("Example", "`removerole @user Member`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            if (offset == 1)
            {
                user = await PermissionHelper.ResolveUserAsync(guild, args[0]).ConfigureAwait(false);
            }

            if (user is null)
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
                await user.RemoveRoleAsync(role).ConfigureAwait(false);
                EmbedBuilder embed = new()
                {
                    Title = "🛡️ Role Removed",
                    Color = new Color(0xFF0000)
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Role", role.Name, inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.WithFooter("Role removal completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to remove role. Check role hierarchy.")).ConfigureAwait(false);
            }
        }
    }
}
