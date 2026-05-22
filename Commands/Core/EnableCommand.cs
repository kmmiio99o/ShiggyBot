using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    /// <summary>
    /// Command to re-enable a disabled server command.
    /// </summary>
    internal sealed class EnableCommand : ICommand
    {
        private readonly DatabaseService _db;

        internal EnableCommand(DatabaseService db)
        {
            _db = db;
        }

        /// <summary>Gets the command name.</summary>
        public string Name => "enable";
        /// <summary>Gets the command description.</summary>
        public string Description => "Re-enable a disabled command in this server";
        /// <summary>Gets the command category.</summary>
        public string Category => "Moderation";
        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => [];

        /// <summary>Executes the command.</summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
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
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Enable Command",
                    Description = "Re-enable a disabled command in this server",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`enable <command>`", inline: false);
                usageEmbed.AddField("Example", "`enable nuke`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            string commandName = args[0];
            await _db.EnableCommandAsync(guildChannel.Guild.Id, commandName).ConfigureAwait(false);
            await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed($"Command `{commandName}` has been enabled in this server.")).ConfigureAwait(false);
        }
    }
}
