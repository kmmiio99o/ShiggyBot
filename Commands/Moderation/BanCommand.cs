using System.Globalization;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class BanCommand(DatabaseService db) : ICommand
    {
        public string Name => "ban";
        public string Description => "Ban a user from the server (supports timed bans)";
        public string Category => "Moderation";
        public string[] Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.BanMembers).ConfigureAwait(false))
            {
                return;
            }

            SocketGuildChannel guildChannel = (SocketGuildChannel)message.Channel;

            if (args.Length == 0)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🛡️ Ban Command",
                    Description = "Permanently ban a user from the server",
                    Color = new Color(0xFFA500)
                };
                _ = usageEmbed.AddField("Usage", "`ban <user> [duration] [reason]`", inline: false);
                _ = usageEmbed.AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days (optional)", inline: false);
                _ = usageEmbed.AddField("Example", "`ban @user 7d Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            string userArg = args[0];
            int deleteDays = 0;

            // Check if second arg is a duration
            TimeSpan? duration = null;
            int reasonStart = 1;
            if (args.Length > 1 && TryParseDuration(args[1], out TimeSpan parsedDuration))
            {
                duration = parsedDuration;
                reasonStart = 2;
            }

            string reason = args.Length > reasonStart ? string.Join(" ", args, reasonStart, args.Length - reasonStart) : "No reason provided";

            SocketGuild guild = guildChannel.Guild;
            ulong? userId = EmbedHelper.ParseUserMention(userArg);
            SocketGuildUser? user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString(CultureInfo.InvariantCulture) == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found.")).ConfigureAwait(false);
                return;
            }

            try
            {
                await user.BanAsync(deleteDays, reason).ConfigureAwait(false);

                // If timed ban, add to database
                if (duration.HasValue)
                {
                    DateTime unbanTime = DateTime.UtcNow.Add(duration.Value);
                    await db.AddTimedBanAsync(guild.Id, user.Id, unbanTime, reason, message.Author.Id).ConfigureAwait(false);
                }

                EmbedBuilder embed = new()
                {
                    Title = "🛡️ User Banned",
                    Color = new Color(0xFF0000),
                    ThumbnailUrl = user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl()
                };
                _ = embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                _ = embed.AddField("Moderator", message.Author.Username, inline: true);
                _ = embed.AddField("Reason", reason, inline: false);
                if (duration.HasValue)
                {
                    _ = embed.AddField("Duration", $"{duration.Value.TotalDays} day(s)", inline: true);
                }
                _ = embed.AddField("Delete Messages", $"Last {deleteDays} day(s)", inline: true);
                embed.WithFooter("Ban action completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to ban user. Check role hierarchy.")).ConfigureAwait(false);
            }
        }

        private static bool TryParseDuration(string input, out TimeSpan duration)
        {
            duration = TimeSpan.Zero;
            if (string.IsNullOrEmpty(input))
            {
                return false;
            }

            try
            {
                if (input.EndsWith('s'))
                {
                    duration = TimeSpan.FromSeconds(int.Parse(input.TrimEnd('s'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('m'))
                {
                    duration = TimeSpan.FromMinutes(int.Parse(input.TrimEnd('m'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('h'))
                {
                    duration = TimeSpan.FromHours(int.Parse(input.TrimEnd('h'), CultureInfo.InvariantCulture));
                }
                else if (input.EndsWith('d'))
                {
                    duration = TimeSpan.FromDays(int.Parse(input.TrimEnd('d'), CultureInfo.InvariantCulture));
                }
                else
                {
                    return false;
                }
                return true;
            }
            catch (FormatException)
            {
                return false;
            }
        }
    }
}
