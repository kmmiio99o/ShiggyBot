using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Core
{
    internal sealed class SetWelcomeCommand(DatabaseService db) : ICommand
    {
        public string Name => "setwelcome";
        public string Description => "Set the welcome role for new members in this server";
        public string Category => "Core";
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

            SocketGuild guild = guildChannel.Guild;

            if (args.Length == 0)
            {
                ulong? current = await db.GetWelcomeRoleAsync(guild.Id).ConfigureAwait(false);
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
                await db.SetWelcomeRoleAsync(guild.Id, 0).ConfigureAwait(false);
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

            await db.SetWelcomeRoleAsync(guild.Id, role.Id).ConfigureAwait(false);
            await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed($"Welcome role set to **{role.Name}** for this server.")).ConfigureAwait(false);
        }
    }
}
