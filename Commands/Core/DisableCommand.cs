using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    internal sealed class DisableCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;
        private readonly DatabaseService _db;

        internal DisableCommand(ComponentsV1Client v1Client, DatabaseService db)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            ArgumentNullException.ThrowIfNull(db);
            _v1Client = v1Client;
            _db = db;
        }

        public string Name => "disable";

        public string Description => "Disable a command in this server";

        public string Category => "Moderation";

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

            if (args.Length == 0)
            {
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("🛡️ Disable Command")
                        .WithDescription("Disable a command in this server")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`disable <command>`", false)
                        .AddField("Example", "`disable nuke`", false));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            string commandName = args[0];
            await _db.DisableCommandAsync(guildChannel.Guild.Id, commandName).ConfigureAwait(false);

            V1MessageBuilder successBuilder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("Success")
                    .WithDescription($"Command `{commandName}` has been disabled in this server.")
                    .WithColor(0x00FF00));

            await _v1Client.SendMessageAsync(message.Channel.Id, successBuilder).ConfigureAwait(false);
        }
    }
}
