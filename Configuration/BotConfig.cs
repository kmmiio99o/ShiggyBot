using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Configuration
{
    /// <summary>
    /// Configuration class for bot settings.
    /// </summary>
    internal sealed class BotConfig
    {
        /// <summary>
        /// Gets or sets the Discord bot token.
        /// </summary>
        public string Token { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the command prefix.
        /// </summary>
        public string Prefix { get; set; } = "S";

        /// <summary>
        /// Loads bot configuration from IConfiguration.
        /// </summary>
        /// <param name="config">The configuration instance.</param>
        /// <returns>A new BotConfig instance.</returns>
        public static BotConfig LoadFromConfiguration(IConfiguration config)
        {
            string? token = config["DISCORD_TOKEN"];
            if (string.IsNullOrWhiteSpace(token))
            {
                token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");
            }
            if (string.IsNullOrWhiteSpace(token))
            {
                token = string.Empty;
            }

            string? prefix = config["PREFIX"];
            if (string.IsNullOrWhiteSpace(prefix))
            {
                prefix = Environment.GetEnvironmentVariable("PREFIX");
            }
            if (string.IsNullOrWhiteSpace(prefix))
            {
                prefix = "S";
            }

            Utils.Logger.Info($"Token loaded: {(!string.IsNullOrEmpty(token) ? "YES" : "NO")}");
            Utils.Logger.Info($"Prefix loaded: {prefix}");

            return new BotConfig { Token = token, Prefix = prefix };
        }
    }
}
