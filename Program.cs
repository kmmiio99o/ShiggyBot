using Microsoft.Extensions.Configuration;
using ShiggyBot.Configuration;
using ShiggyBot.Services;
using ShiggyBot.Utils;

AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
{
    Logger.Error($"[FATAL] Unhandled exception. IsTerminating={args.IsTerminating}", args.ExceptionObject as Exception);
};

TaskScheduler.UnobservedTaskException += (sender, args) =>
{
    Logger.Error($"[FATAL] Unobserved task exception", args.Exception);
    args.SetObserved();
};

IConfigurationBuilder builder = new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json", optional: true)
    .AddEnvironmentVariables();

string configTxt = Path.Combine(Directory.GetCurrentDirectory(), "config.txt");
if (File.Exists(configTxt))
{
    string[] lines = await File.ReadAllLinesAsync(configTxt).ConfigureAwait(false);
    Dictionary<string, string?> ini = lines
        .Where(l => !string.IsNullOrWhiteSpace(l) && !l.TrimStart().StartsWith('#'))
        .Select(l => l.Split('=', 2))
        .Where(p => p.Length == 2)
        .ToDictionary(p => p[0].Trim(), p => (string?)p[1].Trim());

    if (ini.Count > 0)
    {
        builder.AddInMemoryCollection(ini);
    }
}

IConfiguration appConfig = builder.Build();

BotConfig config = BotConfig.LoadFromConfiguration(appConfig);
using DiscordClientService client = new(config, appConfig);
await client.StartAsync().ConfigureAwait(false);
