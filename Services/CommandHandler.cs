using Discord.WebSocket;
using Microsoft.Extensions.Configuration;
using ShiggyBot.Commands;
using ShiggyBot.Commands.Utility;
using ShiggyBot.Commands.Moderation;
using ShiggyBot.Commands.Search;
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
        private readonly IConfiguration _config;
        private readonly DatabaseService _db;
        private readonly PluginService _pluginService;
        private AiCommand? _aiCommand;

        public CommandHandler(DiscordSocketClient client, string prefix, IConfiguration config, DatabaseService db)
        {
            _client = client;
            Prefix = prefix ?? "S";
            _config = config;
            _db = db;
            _pluginService = new PluginService();
            RegisterCommands();
            Console.WriteLine($"[INIT] Registered {_commands.Count} command(s)");
        }

        public void Dispose()
        {
            _aiCommand?.Dispose();
            _pluginService?.Dispose();
            GC.SuppressFinalize(this);
        }

        private void RegisterCommands()
        {
            // Utility Commands
            Register(new PingCommand());
            Register(new HelpCommand(this));
            Register(new NoteCommand());
            _aiCommand = new(_config);
            Register(_aiCommand);

            // Moderation Commands
            Register(new KickCommand());
            Register(new BanCommand(_db));
            Register(new TimeoutCommand());
            Register(new PurgeCommand());
            Register(new AddRoleCommand());
            Register(new RemoveRoleCommand());

            // Search Commands
            Register(new PluginCommand(_pluginService));
            Register(new GoogleCommand());
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
                _ = await userMessage.Channel.SendMessageAsync("Unknown command. Use " + Prefix + "help for details.").ConfigureAwait(false);
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
        }
    }
}
