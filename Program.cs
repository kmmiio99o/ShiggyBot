using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using ShiggyBot.Configuration;
using ShiggyBot.Services;

namespace ShiggyBot
{
    class Program
    {
        static async Task Main(string[] args)
        {
            var builder = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: true)
                .AddEnvironmentVariables();

            var appConfig = builder.Build();

            var config = BotConfig.LoadFromConfiguration(appConfig);
            using var client = new DiscordClientService(config, appConfig);
            await client.StartAsync();
        }
    }
}
