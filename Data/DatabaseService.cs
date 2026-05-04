using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;

namespace ShiggyBot.Data
{
    public class DatabaseService : IDisposable
    {
        private readonly SqliteConnection _connection;
        private readonly string _dbPath;

        public DatabaseService(string dbPath = "shiggybot.db")
        {
            // Store database in the same directory as the executable
            var baseDir = AppContext.BaseDirectory;
            _dbPath = Path.Combine(baseDir, dbPath);
            _connection = new SqliteConnection($"Data Source={_dbPath}");
            InitializeDatabase().Wait();
        }

        private async Task InitializeDatabase()
        {
            await _connection.OpenAsync();
            var command = _connection.CreateCommand();
            command.CommandText =
            @"
                CREATE TABLE IF NOT EXISTS TimedBans (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    GuildId TEXT NOT NULL,
                    UserId TEXT NOT NULL,
                    BanTime TEXT NOT NULL,
                    UnbanTime TEXT NOT NULL,
                    Reason TEXT,
                    ModeratorId TEXT
                )
            ";
            await command.ExecuteNonQueryAsync();
        }

        public async Task AddTimedBanAsync(ulong guildId, ulong userId, DateTime unbanTime, string? reason = null, ulong? moderatorId = null)
        {
            var command = _connection.CreateCommand();
            command.CommandText =
            @"
                INSERT INTO TimedBans (GuildId, UserId, BanTime, UnbanTime, Reason, ModeratorId)
                VALUES ($guildId, $userId, $banTime, $unbanTime, $reason, $moderatorId)
            ";
            command.Parameters.AddWithValue("$guildId", guildId.ToString());
            command.Parameters.AddWithValue("$userId", userId.ToString());
            command.Parameters.AddWithValue("$banTime", DateTime.UtcNow.ToString("o"));
            command.Parameters.AddWithValue("$unbanTime", unbanTime.ToString("o"));
            command.Parameters.AddWithValue("$reason", reason ?? "No reason provided");
            command.Parameters.AddWithValue("$moderatorId", moderatorId?.ToString() ?? "Unknown");
            await command.ExecuteNonQueryAsync();
        }

        public async Task RemoveTimedBanAsync(ulong guildId, ulong userId)
        {
            var command = _connection.CreateCommand();
            command.CommandText = "DELETE FROM TimedBans WHERE GuildId = $guildId AND UserId = $userId";
            command.Parameters.AddWithValue("$guildId", guildId.ToString());
            command.Parameters.AddWithValue("$userId", userId.ToString());
            await command.ExecuteNonQueryAsync();
        }

        public async Task<List<TimedBan>> GetExpiredBansAsync()
        {
            var expiredBans = new List<TimedBan>();
            var command = _connection.CreateCommand();
            command.CommandText = "SELECT * FROM TimedBans WHERE UnbanTime <= $currentTime";
            command.Parameters.AddWithValue("$currentTime", DateTime.UtcNow.ToString("o"));

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                expiredBans.Add(new TimedBan
                {
                    Id = reader.GetInt32(0),
                    GuildId = ulong.Parse(reader.GetString(1)),
                    UserId = ulong.Parse(reader.GetString(2)),
                    BanTime = DateTime.Parse(reader.GetString(3)),
                    UnbanTime = DateTime.Parse(reader.GetString(4)),
                    Reason = reader.GetString(5),
                    ModeratorId = reader.GetString(6)
                });
            }
            return expiredBans;
        }

        public void Dispose()
        {
            _connection?.Dispose();
        }
    }

    public class TimedBan
    {
        public int Id { get; set; }
        public ulong GuildId { get; set; }
        public ulong UserId { get; set; }
        public DateTime BanTime { get; set; }
        public DateTime UnbanTime { get; set; }
        public string? Reason { get; set; }
        public string? ModeratorId { get; set; }
    }
}
