using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class AddRoleCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal AddRoleCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "addrole";

        public string Description => "Add a role to a user";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

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
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Add Role Command")
                        .WithDescription("Add a role to a server member")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`addrole <user> <role>`", false)
                        .AddField("Reply Usage", "Reply to a message with `addrole <role>`", false)
                        .AddField("Example", "`addrole @user Member`", false));

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

            string roleArg = string.Join(" ", args, offset, args.Length - offset);
            SocketRole? role = PermissionHelper.ResolveRole(guild, roleArg);

            if (role == null)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Role not found.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
                return;
            }

            try
            {
                await user.AddRoleAsync(role).ConfigureAwait(false);

                V1MessageBuilder builder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Role Added")
                        .WithColor(0x00FF00)
                        .AddField("User", $"{user.Username}#{user.Discriminator}", true)
                        .AddField("Role", role.Name, true)
                        .AddField("Moderator", message.Author.Username, true)
                        .WithFooter("Role assignment completed")
                        .WithTimestamp(DateTimeOffset.UtcNow));

                await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Failed to add role. Check role hierarchy.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
            catch (TaskCanceledException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Request timed out. Try again.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
        }
    }
}
