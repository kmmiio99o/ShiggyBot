using Discord;
using Discord.WebSocket;

namespace ShiggyBot.Utils
{
    internal static class ErrorHandler
    {
        public static string? WebhookUrl { get; set; }

        public static async Task HandleCommandErrorAsync(SocketUserMessage message, Exception ex, string commandName)
        {
            ArgumentNullException.ThrowIfNull(message);
            Logger.Error($"Error in command '{commandName}': {ex}", ex);

            _ = WebhookLogger.SendErrorAsync(WebhookUrl, $"Error in command `{commandName}`.", ex);

            Embed embed = EmbedHelper.BuildErrorEmbed($"An error occurred while executing `{commandName}`.");
            await message.Channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
        }

        public static Task HandleFeatureErrorAsync(Exception ex, string featureName)
        {
            Logger.Error($"Error in feature '{featureName}': {ex}", ex);
            _ = WebhookLogger.SendErrorAsync(WebhookUrl, $"Error in feature `{featureName}`.", ex);
            return Task.CompletedTask;
        }

        public static void LogWarning(string message)
        {
            Logger.Warn(message);
        }

        public static void LogError(string message, Exception? ex = null)
        {
            Logger.Error(message);
            if (ex != null)
            {
                Logger.Error(ex.ToString(), ex);
            }
        }
    }
}
