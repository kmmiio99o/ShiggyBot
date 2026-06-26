using Discord.WebSocket;
using Microsoft.Data.Sqlite;
using ShiggyBot.Commands;
using ShiggyBot.Commands.Utility;
using ShiggyBot.Commands.Moderation;
using ShiggyBot.Commands.Core;
using ShiggyBot.Commands.Search;
using ShiggyBot.Commands.Fun;
using ShiggyBot.Components.V2;
using ShiggyBot.Utils;
using ShiggyBot.Data;

namespace ShiggyBot.Services
{
    internal sealed class CommandHandler : IDisposable
    {
        private readonly DiscordSocketClient _client;
        public string Prefix { get; }
        private readonly Dictionary<string, ICommand> _commands = new(StringComparer.OrdinalIgnoreCase);
        private readonly List<ICommand> _commandList = [];
        private readonly DatabaseService _db;
        private readonly PluginService _pluginService;
        private readonly ComponentsV2Client? _v2Client;
        public CommandHandler(DiscordSocketClient client, string prefix, DatabaseService db, ComponentsV2Client? v2Client = null)
        {
            _client = client;
            Prefix = prefix ?? "S";
            _db = db;
            _pluginService = new PluginService();
            _v2Client = v2Client;
            RegisterCommands();
            Console.WriteLine($"[INIT] Registered {_commands.Count} command(s)");
        }

        public void Dispose()
        {
            _pluginService?.Dispose();
            GC.SuppressFinalize(this);
        }

        private void RegisterCommands()
        {
            // Utility Commands
            Register(new PingCommand());
            Register(new HelpCommand(this));
            Register(new NoteCommand());

            // Moderation Commands
            Register(new KickCommand());
            Register(new BanCommand(_db));
            Register(new TimeoutCommand());
            Register(new PurgeCommand());
            Register(new AddRoleCommand());
            Register(new RemoveRoleCommand());
            Register(new NukeCommand());
            Register(new DisableCommand(_db));
            Register(new EnableCommand(_db));
            Register(new SetWelcomeCommand(_db));

            // Search Commands
            Register(new PluginCommand(_pluginService));
            Register(new GoogleCommand());

            // Fun Commands
            Register(new MpregCommand());

            // V2 Components Test Command
            if (_v2Client is not null)
            {
                Register(new V2TestCommand(_v2Client));
            }
        }

        private void Register(ICommand command)
        {
            _commands[command.Name] = command;
            _commandList.Add(command);
            foreach (string alias in command.Aliases ?? [])
            {
                _commands[alias] = command;
            }
        }

        public Dictionary<string, List<ICommand>> GetCommandsByCategory()
        {
            return _commandList
                .GroupBy(c => c.Category ?? "Other")
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        }

        public ICommand? GetCommandByName(string name)
        {
            _commands.TryGetValue(name, out ICommand? command);
            return command;
        }

        public async Task HandleAsync(SocketMessage message)
        {
            ArgumentNullException.ThrowIfNull(message);

            if (message is not SocketUserMessage userMessage)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(userMessage.Content))
            {
                return;
            }

            if (!userMessage.Content.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            string content = userMessage.Content[Prefix.Length..].Trim();
            if (string.IsNullOrEmpty(content))
            {
                return;
            }

            string[] parts = content.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                return;
            }

            string name = parts[0].ToUpperInvariant();
            string[] args = [.. parts.Skip(1)];

            if (!_commands.TryGetValue(name, out ICommand? command))
            {
                return;
            }

            if (userMessage.Channel is SocketGuildChannel guildChannel &&
                command.Name != "disable" &&
                command.Name != "enable" &&
                await _db.IsCommandDisabledAsync(guildChannel.Guild.Id, name).ConfigureAwait(false))
            {
                _ = await userMessage.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed($"Command `{command.Name}` is disabled in this server.")).ConfigureAwait(false);
                return;
            }

            try
            {
                await command.ExecuteAsync(userMessage, args, _client).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                await ErrorHandler.HandleCommandErrorAsync(userMessage, ex, command.Name).ConfigureAwait(false);
            }
            catch (TaskCanceledException ex)
            {
                await ErrorHandler.HandleCommandErrorAsync(userMessage, ex, command.Name).ConfigureAwait(false);
            }
            catch (InvalidOperationException ex)
            {
                await ErrorHandler.HandleCommandErrorAsync(userMessage, ex, command.Name).ConfigureAwait(false);
            }
            catch (SqliteException ex)
            {
                await ErrorHandler.HandleCommandErrorAsync(userMessage, ex, command.Name).ConfigureAwait(false);
            }
        }
    }
}
