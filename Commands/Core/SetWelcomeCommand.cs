using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    internal sealed class SetWelcomeCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;
        private readonly DatabaseService _db;

        internal SetWelcomeCommand(ComponentsV1Client v1Client, DatabaseService db)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            ArgumentNullException.ThrowIfNull(db);
            _v1Client = v1Client;
            _db = db;
        }

        public string Name => "setwelcome";

        public string Description => "Set the welcome role for new members in this server";

        public string Category => "Core";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.ManageGuild).ConfigureAwait(false))
            {
                return;
            }

            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                return;
            }

            SocketGuild guild = guildChannel.Guild;

            if (args.Length == 0)
            {
                ulong? current = await _db.GetWelcomeRoleAsync(guild.Id).ConfigureAwait(false);
                string currentStr = "None";
                if (current is not null and not 0)
                {
                    IRole? welcomeRole = await ((IGuild)guild).GetRoleAsync(current.Value).ConfigureAwait(false);
                    currentStr = welcomeRole?.Name ?? current.Value.ToString(CultureInfo.InvariantCulture);
                }

                V1MessageBuilder infoBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Welcome Role")
                        .WithDescription(currentStr == "None" ? "No welcome role is set for this server." : $"Current welcome role: {currentStr}")
                        .WithColor(0x1E90FF)
                        .AddField("Usage", "`setwelcome <role>`", false)
                        .AddField("Example", "`setwelcome @Member`", false)
                        .AddField("Disable", "`setwelcome disable`", false));

                await _v1Client.SendMessageAsync(message.Channel.Id, infoBuilder).ConfigureAwait(false);
                return;
            }

            if (args[0].Equals("disable", StringComparison.OrdinalIgnoreCase) ||
                args[0].Equals("none", StringComparison.OrdinalIgnoreCase) ||
                args[0].Equals("off", StringComparison.OrdinalIgnoreCase))
            {
                await _db.SetWelcomeRoleAsync(guild.Id, 0).ConfigureAwait(false);

                V1MessageBuilder successBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Success")
                        .WithDescription("Welcome role has been disabled for this server.")
                        .WithColor(0x00FF00));

                await _v1Client.SendMessageAsync(message.Channel.Id, successBuilder).ConfigureAwait(false);
                return;
            }

            string roleArg = string.Join(" ", args);
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

            await _db.SetWelcomeRoleAsync(guild.Id, role.Id).ConfigureAwait(false);

            V1MessageBuilder setBuilder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("Success")
                    .WithDescription($"Welcome role set to **{role.Name}** for this server.")
                    .WithColor(0x00FF00));

            await _v1Client.SendMessageAsync(message.Channel.Id, setBuilder).ConfigureAwait(false);
        }
    }
}
