using System;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;

namespace ShiggyBot.Utils
{
    public static class ErrorHandler
    {
        public static async Task HandleCommandErrorAsync(SocketUserMessage message, Exception ex, string commandName)
        {
            Console.WriteLine($"Error in command '{commandName}': {ex}");

            var embed = EmbedHelper.BuildErrorEmbed($"An error occurred while executing `{commandName}`.");
            await message.Channel.SendMessageAsync(embed: embed);
        }

        public static async Task HandleFeatureErrorAsync(SocketMessage message, Exception ex, string featureName)
        {
            Console.WriteLine($"Error in feature '{featureName}': {ex}");
            // Features typically don't respond on error to avoid spam
        }

        public static void LogWarning(string message)
        {
            Console.WriteLine($"Warning: {message}");
        }

        public static void LogError(string message, Exception? ex = null)
        {
            Console.WriteLine($"Error: {message}");
            if (ex != null)
            {
                Console.WriteLine(ex);
            }
        }
    }
}
