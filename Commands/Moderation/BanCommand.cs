using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Commands.Moderation
{
    public class BanCommand : ICommand
    {
        private readonly DatabaseService _db;

        public BanCommand(DatabaseService db)
        {
            _db = db;
        }

        public string Name => "ban";
        public string Description => "Ban a user from the server (supports timed bans)";
        public string Category => "Moderation";
        public string[] Aliases => new string[0];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server."));
                return;
            }

            if (!((SocketGuildUser)message.Author).GuildPermissions.BanMembers)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("You need BanMembers permission to use this command."));
                return;
            }

            if (args.Length == 0)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🛡️ Ban Command",
                    Description = "Permanently ban a user from the server",
                    Color = new Color(0xFFA500)
                };
                usageEmbed.AddField("Usage", "`ban <user> [duration] [reason]`", inline: false);
                usageEmbed.AddField("Duration Format", "s = seconds, m = minutes, h = hours, d = days (optional)", inline: false);
                usageEmbed.AddField("Example", "`ban @user 7d Breaking rules`", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            var userArg = args[0];
            int deleteDays = 0;

            // Check if second arg is a duration
            TimeSpan? duration = null;
            int reasonStart = 1;
            if (args.Length > 1 && TryParseDuration(args[1], out var parsedDuration))
            {
                duration = parsedDuration;
                reasonStart = 2;
            }

            var reason = args.Length > reasonStart ? string.Join(" ", args, reasonStart, args.Length - reasonStart) : "No reason provided";

            var guild = guildChannel.Guild;
            var userId = EmbedHelper.ParseUserMention(userArg);
            var user = userId.HasValue ? guild.GetUser(userId.Value) : guild.Users.FirstOrDefault(u => u.Username == userArg || u.Id.ToString() == userArg);

            if (user == null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("User not found."));
                return;
            }

            try
            {
                await user.BanAsync(deleteDays, reason);

                // If timed ban, add to database
                if (duration.HasValue)
                {
                    var unbanTime = DateTime.UtcNow.Add(duration.Value);
                    await _db.AddTimedBanAsync(guild.Id, user.Id, unbanTime, reason, message.Author.Id);
                }

                var embed = new EmbedBuilder
                {
                    Title = "🛡️ User Banned",
                    Color = new Color(0xFF0000),
                    ThumbnailUrl = user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl()
                };
                embed.AddField("User", $"{user.Username}#{user.Discriminator}", inline: true);
                embed.AddField("Moderator", message.Author.Username, inline: true);
                embed.AddField("Reason", reason, inline: false);
                if (duration.HasValue)
                    embed.AddField("Duration", $"{duration.Value.TotalDays} day(s)", inline: true);
                embed.AddField("Delete Messages", $"Last {deleteDays} day(s)", inline: true);
                embed.WithFooter("Ban action completed");
                embed.WithCurrentTimestamp();
                await message.Channel.SendMessageAsync(embed: embed.Build());
            }
            catch
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to ban user. Check role hierarchy."));
            }
        }

        private static bool TryParseDuration(string input, out TimeSpan duration)
        {
            duration = TimeSpan.Zero;
            if (string.IsNullOrEmpty(input)) return false;

            try
            {
                if (input.EndsWith("s")) duration = TimeSpan.FromSeconds(int.Parse(input.TrimEnd('s')));
                else if (input.EndsWith("m")) duration = TimeSpan.FromMinutes(int.Parse(input.TrimEnd('m')));
                else if (input.EndsWith("h")) duration = TimeSpan.FromHours(int.Parse(input.TrimEnd('h')));
                else if (input.EndsWith("d")) duration = TimeSpan.FromDays(int.Parse(input.TrimEnd('d')));
                else return false;
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
