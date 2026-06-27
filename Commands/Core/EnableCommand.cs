using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    internal sealed class EnableCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;
        private readonly DatabaseService _db;

        internal EnableCommand(ComponentsV1Client v1Client, DatabaseService db)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            ArgumentNullException.ThrowIfNull(db);
            _v1Client = v1Client;
            _db = db;
        }

        public string Name => "enable";

        public string Description => "Re-enable a disabled command in this server";

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
                        .WithTitle("🛡️ Enable Command")
                        .WithDescription("Re-enable a disabled command in this server")
                        .WithColor(0xFFA500)
                        .AddField("Usage", "`enable <command>`", false)
                        .AddField("Example", "`enable nuke`", false));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            string commandName = args[0];
            await _db.EnableCommandAsync(guildChannel.Guild.Id, commandName).ConfigureAwait(false);

            V1MessageBuilder successBuilder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("Success")
                    .WithDescription($"Command `{commandName}` has been enabled in this server.")
                    .WithColor(0x00FF00));

            await _v1Client.SendMessageAsync(message.Channel.Id, successBuilder).ConfigureAwait(false);
        }
    }
}
