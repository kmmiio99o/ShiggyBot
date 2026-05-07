using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    internal sealed class EnableCommand(DatabaseService db) : ICommand
    {
        public string Name => "enable";
        public string Description => "Re-enable a disabled command in this server";
        public string Category => "Moderation";
        public string[] Aliases => [];

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
            await db.EnableCommandAsync(guildChannel.Guild.Id, commandName).ConfigureAwait(false);
            await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed($"Command `{commandName}` has been enabled in this server.")).ConfigureAwait(false);
        }
    }
}
