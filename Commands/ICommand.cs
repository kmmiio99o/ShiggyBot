using Discord.WebSocket;

namespace ShiggyBot.Commands
{
    internal interface ICommand
    {
        string Name { get; }
        string Description { get; }
        string Category { get; }
        IReadOnlyList<string> Aliases { get; }
        Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client);
    }
}
