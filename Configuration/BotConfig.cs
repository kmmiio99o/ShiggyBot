using System;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Configuration
{
    public class BotConfig
    {
        public string Token { get; set; } = string.Empty;
        public string Prefix { get; set; } = "S";

        public static BotConfig LoadFromConfiguration(IConfiguration config)
        {
            var token = config["DISCORD_TOKEN"];
            if (string.IsNullOrWhiteSpace(token))
                token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");
            if (string.IsNullOrWhiteSpace(token))
                token = string.Empty;

            var prefix = config["PREFIX"];
            if (string.IsNullOrWhiteSpace(prefix))
                prefix = Environment.GetEnvironmentVariable("PREFIX");
            if (string.IsNullOrWhiteSpace(prefix))
                prefix = "S";

            Console.WriteLine($"Token loaded: {(!string.IsNullOrEmpty(token) ? "YES" : "NO")}");
            Console.WriteLine($"Prefix loaded: {prefix}");

            return new BotConfig { Token = token, Prefix = prefix ?? "S" };
        }
    }
}
