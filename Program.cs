using Microsoft.Extensions.Configuration;
using ShiggyBot.Configuration;
using ShiggyBot.Services;

IConfigurationBuilder builder = new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json", optional: true)
    .AddEnvironmentVariables();

IConfiguration appConfig = builder.Build();

BotConfig config = BotConfig.LoadFromConfiguration(appConfig);
using DiscordClientService client = new(config, appConfig);
await client.StartAsync().ConfigureAwait(false);
