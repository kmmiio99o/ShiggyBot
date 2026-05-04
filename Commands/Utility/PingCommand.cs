using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using ShiggyBot.Commands;

namespace ShiggyBot.Commands.Utility
{
  public class PingCommand : ICommand
  {
    public string Name => "ping";
    public string Description => "Check bot latency and response time";
    public string Category => "Utility";
    public string[] Aliases => new[] { "sping" };

    public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
    {
      var latency = client.Latency;
      var embed = EmbedHelper.BuildPingEmbed(latency);
      await message.Channel.SendMessageAsync(embed: embed);
    }
  }
}
