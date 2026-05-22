using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    /// <summary>
    /// Command to configure the welcome role for a server.
    /// </summary>
    internal sealed class SetWelcomeCommand : ICommand
    {
        private readonly DatabaseService _db;

        internal SetWelcomeCommand(DatabaseService db)
        {
            _db = db;
        }

        /// <summary>Gets the command name.</summary>
        public string Name => "setwelcome";
        /// <summary>Gets the command description.</summary>
        public string Description => "Set the welcome role for new members in this server";
        /// <summary>Gets the command category.</summary>
        public string Category => "Core";
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
                EmbedBuilder embed = new()
                {
                    Title = "Welcome Role",
                    Description = currentStr == "None" ? "No welcome role is set for this server." : $"Current welcome role: {currentStr}",
                    Color = new Color(0x1E90FF)
                };
                embed.AddField("Usage", "`setwelcome <role>`", inline: false);
                embed.AddField("Example", "`setwelcome @Member`", inline: false);
                embed.AddField("Disable", "`setwelcome disable`", inline: false);
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
                return;
            }

            if (args[0].Equals("disable", StringComparison.OrdinalIgnoreCase) ||
                args[0].Equals("none", StringComparison.OrdinalIgnoreCase) ||
                args[0].Equals("off", StringComparison.OrdinalIgnoreCase))
            {
                await _db.SetWelcomeRoleAsync(guild.Id, 0).ConfigureAwait(false);
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed("Welcome role has been disabled for this server.")).ConfigureAwait(false);
                return;
            }

            string roleArg = string.Join(" ", args);
            SocketRole? role = PermissionHelper.ResolveRole(guild, roleArg);

            if (role == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Role not found.")).ConfigureAwait(false);
                return;
            }

            await _db.SetWelcomeRoleAsync(guild.Id, role.Id).ConfigureAwait(false);
            await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed($"Welcome role set to **{role.Name}** for this server.")).ConfigureAwait(false);
        }
    }
}
