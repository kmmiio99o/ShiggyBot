using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Discord;
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
    public class CommandHandler
    {
        private readonly DiscordSocketClient _client;
        private readonly string _prefix;
        private readonly Dictionary<string, ICommand> _commands = new(StringComparer.OrdinalIgnoreCase);
        private readonly List<ICommand> _commandList = new();
        private readonly IConfiguration _config;
        private readonly DatabaseService _db;
        private readonly PluginService _pluginService;

        public string Prefix => _prefix;

        public CommandHandler(DiscordSocketClient client, string prefix, IConfiguration config, DatabaseService db)
        {
            _client = client;
            _prefix = prefix ?? "S";
            _config = config;
            _db = db;
            _pluginService = new PluginService();
            RegisterCommands();
            Console.WriteLine($"[INIT] Registered {_commands.Count} command(s)");
        }

        private void RegisterCommands()
        {
            // Utility Commands
            Register(new PingCommand());
            Register(new HelpCommand(this));
            Register(new NoteCommand());
            Register(new AiCommand(_config));

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
            foreach (var alias in command.Aliases ?? Array.Empty<string>())
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
            _commands.TryGetValue(name, out var command);
            return command;
        }

        public async Task HandleAsync(SocketMessage message)
        {
            if (!(message is SocketUserMessage userMessage)) return;
            if (string.IsNullOrWhiteSpace(userMessage.Content)) return;
            if (!userMessage.Content.StartsWith(_prefix, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var content = userMessage.Content.Substring(_prefix.Length).Trim();
            if (string.IsNullOrEmpty(content)) return;
            var parts = content.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return;
            var name = parts[0].ToLower();
            var args = parts.Skip(1).ToArray();

            if (!_commands.TryGetValue(name, out var command))
            {
                await userMessage.Channel.SendMessageAsync("Unknown command. Use " + _prefix + "help for details.");
                return;
            }

            try
            {
                await command.ExecuteAsync(userMessage, args, _client);
            }
            catch (Exception ex)
            {
                await ErrorHandler.HandleCommandErrorAsync(userMessage, ex, command.Name);
            }
        }
    }
}
