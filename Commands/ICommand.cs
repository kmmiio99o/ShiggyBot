using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;

namespace ShiggyBot.Commands
{
  public interface ICommand
  {
    string Name { get; }
    string Description { get; }
    string Category { get; }
    string[] Aliases { get; }
    Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client);
  }
}
