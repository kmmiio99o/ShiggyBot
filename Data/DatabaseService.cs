using System.Globalization;
using Microsoft.Data.Sqlite;

namespace ShiggyBot.Data
{
    internal sealed class DatabaseService : IDisposable
    {
        private readonly SqliteConnection _connection;
        private readonly string _dbPath;

        public DatabaseService(string dbPath = "shiggybot.db")
        {
            // Store database in the same directory as the executable
            string baseDir = AppContext.BaseDirectory;
            _dbPath = Path.Combine(baseDir, dbPath);
            _connection = new($"Data Source={_dbPath}");
            InitializeDatabase().Wait();
        }

        private async Task InitializeDatabase()
        {
            await _connection.OpenAsync().ConfigureAwait(false);
            SqliteCommand command = _connection.CreateCommand();
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
                );

                CREATE TABLE IF NOT EXISTS DisabledCommands (
                    GuildId TEXT NOT NULL,
                    CommandName TEXT NOT NULL,
                    PRIMARY KEY (GuildId, CommandName)
                )
            ";
            await command.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        public async Task AddTimedBanAsync(ulong guildId, ulong userId, DateTime unbanTime, string? reason = null, ulong? moderatorId = null)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText =
            @"
                INSERT INTO TimedBans (GuildId, UserId, BanTime, UnbanTime, Reason, ModeratorId)
                VALUES ($guildId, $userId, $banTime, $unbanTime, $reason, $moderatorId)
            ";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$userId", userId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$banTime", DateTime.UtcNow.ToString("o"));
            command.Parameters.AddWithValue("$unbanTime", unbanTime.ToString("o"));
            command.Parameters.AddWithValue("$reason", reason ?? "No reason provided");
            command.Parameters.AddWithValue("$moderatorId", moderatorId?.ToString(CultureInfo.InvariantCulture) ?? "Unknown");
            await command.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        public async Task RemoveTimedBanAsync(ulong guildId, ulong userId)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = "DELETE FROM TimedBans WHERE GuildId = $guildId AND UserId = $userId";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$userId", userId.ToString(CultureInfo.InvariantCulture));
            await command.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        public async Task<List<TimedBan>> GetExpiredBansAsync()
        {
            List<TimedBan> expiredBans = [];
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = "SELECT * FROM TimedBans WHERE UnbanTime <= $currentTime";
            command.Parameters.AddWithValue("$currentTime", DateTime.UtcNow.ToString("o"));

            using SqliteDataReader reader = await command.ExecuteReaderAsync().ConfigureAwait(false);
            while (await reader.ReadAsync().ConfigureAwait(false))
            {
                expiredBans.Add(new TimedBan
                {
                    Id = reader.GetInt32(0),
                    GuildId = ulong.Parse(reader.GetString(1), CultureInfo.InvariantCulture),
                    UserId = ulong.Parse(reader.GetString(2), CultureInfo.InvariantCulture),
                    BanTime = DateTime.Parse(reader.GetString(3), CultureInfo.InvariantCulture),
                    UnbanTime = DateTime.Parse(reader.GetString(4), CultureInfo.InvariantCulture),
                    Reason = reader.GetString(5),
                    ModeratorId = reader.GetString(6)
                });
            }
            return expiredBans;
        }

        public async Task DisableCommandAsync(ulong guildId, string commandName)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = @"
                INSERT OR IGNORE INTO DisabledCommands (GuildId, CommandName)
                VALUES ($guildId, $commandName)
            ";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$commandName", commandName.ToUpperInvariant());
            await command.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        public async Task EnableCommandAsync(ulong guildId, string commandName)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = "DELETE FROM DisabledCommands WHERE GuildId = $guildId AND CommandName = $commandName";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$commandName", commandName.ToUpperInvariant());
            await command.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        public async Task<bool> IsCommandDisabledAsync(ulong guildId, string commandName)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = "SELECT COUNT(1) FROM DisabledCommands WHERE GuildId = $guildId AND CommandName = $commandName";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("$commandName", commandName.ToUpperInvariant());
            long count = (long)(await command.ExecuteScalarAsync().ConfigureAwait(false))!;
            return count > 0;
        }

        public async Task<List<string>> GetDisabledCommandsAsync(ulong guildId)
        {
            List<string> commands = [];
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = "SELECT CommandName FROM DisabledCommands WHERE GuildId = $guildId ORDER BY CommandName";
            command.Parameters.AddWithValue("$guildId", guildId.ToString(CultureInfo.InvariantCulture));

            using SqliteDataReader reader = await command.ExecuteReaderAsync().ConfigureAwait(false);
            while (await reader.ReadAsync().ConfigureAwait(false))
            {
                commands.Add(reader.GetString(0));
            }
            return commands;
        }

        public void Dispose()
        {
            _connection?.Dispose();
            GC.SuppressFinalize(this);
        }
    }

    internal sealed class TimedBan
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
