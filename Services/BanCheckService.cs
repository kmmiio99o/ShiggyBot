using System;
using System.Threading;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Data;
using ShiggyBot.Utils;

namespace ShiggyBot.Services
{
    public class BanCheckService
    {
        private readonly DiscordSocketClient _client;
        private readonly DatabaseService _db;
        private Timer? _timer;

        public BanCheckService(DiscordSocketClient client, DatabaseService db)
        {
            _client = client;
            _db = db;
        }

        public void Start()
        {
            // Check every 5 minutes
            _timer = new(async _ => await CheckExpiredBansAsync(), null, TimeSpan.Zero, TimeSpan.FromMinutes(5));
            Console.WriteLine("[STARTUP] Ban check service started");
        }

        private async Task CheckExpiredBansAsync()
        {
            try
            {
                var expiredBans = await _db.GetExpiredBansAsync();
                foreach (var ban in expiredBans)
                {
                    var guild = _client.GetGuild(ban.GuildId);
                    if (guild != null)
                    {
                        await guild.RemoveBanAsync(ban.UserId);
                        Console.WriteLine($"[INFO] Auto-unbanned user {ban.UserId} from guild {guild.Name}");
                    }
                    await _db.RemoveTimedBanAsync(ban.GuildId, ban.UserId);
                }
            }
            catch (Exception ex)
            {
                ErrorHandler.LogError("Failed to check expired bans", ex);
            }
        }

        public void Stop()
        {
            _timer?.Dispose();
        }
    }
}
