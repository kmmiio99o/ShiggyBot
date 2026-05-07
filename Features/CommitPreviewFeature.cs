using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    internal sealed partial class CommitPreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new();
        private static readonly ConcurrentDictionary<string, CommitData> _commitCache = new();

        private static readonly Dictionary<string, string> LanguageMap = new(StringComparer.OrdinalIgnoreCase)
        {
            { "JS", "javascript" }, { "JSX", "javascript" }, { "MJS", "javascript" }, { "CJS", "javascript" },
            { "TS", "typescript" }, { "TSX", "typescript" }, { "MTS", "typescript" }, { "CTS", "typescript" },
            { "HTML", "html" }, { "HTM", "html" }, { "CSS", "css" }, { "SCSS", "scss" }, { "SASS", "sass" },
            { "VUE", "vue" }, { "SVELTE", "svelte" },
            { "PY", "python" }, { "RB", "ruby" }, { "JAVA", "java" }, { "CS", "csharp" },
            { "CPP", "cpp" }, { "C", "c" }, { "GO", "go" }, { "RS" , "rust" }, { "PHP", "php" },
            { "SWIFT", "swift" }, { "KT", "kotlin" }, { "SCALA", "scala" },
            { "JSON", "json" }, { "YAML", "yaml" }, { "YML", "yaml" }, { "XML", "xml" },
            { "TOML", "toml" }, { "SQL", "sql" },
            { "MD", "markdown" }, { "TXT", "text" },
            { "SH", "bash" }, { "BASH", "bash" }, { "ZSH", "bash" }, { "PS1", "powershell" }, { "BAT", "batch" },
            { "DART", "dart" }, { "LUA", "lua" }, { "PERL", "perl" }, { "R", "r" }, { "HS", "haskell" },
            { "DOCKERFILE", "dockerfile" }, { "CONF", "nginx" },
        };

        private static readonly Dictionary<string, string> FilenameMap = new(StringComparer.OrdinalIgnoreCase)
        {
            { "Dockerfile", "dockerfile" }, { "Makefile", "makefile" },
            { "CMakeLists.txt", "cmake" }, { "Rakefile", "ruby" },
            { "Gemfile", "ruby" }, { "Procfile", "text" }, { "Vagrantfile", "ruby" },
        };

        [GeneratedRegex(@"https?://(?:www\.)?(raw\.githubusercontent\.com|github\.com|gitlab\.com|gitea\.com|forgejo\.com|codeberg\.org|git\.gay|bitbucket\.org)/([^\s/]+)/([^\s/]+)/commit/([a-fA-F0-9]+)", RegexOptions.IgnoreCase)]
        private static partial Regex CommitLinkRegex();

        public CommitPreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _http.DefaultRequestHeaders.Add("User-Agent", "ShiggyBot");
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        public static bool TryHandleButton(SocketMessageComponent component)
        {
            string? customId = component.Data?.CustomId;
            if (customId is null || !customId.StartsWith("commit_page_", StringComparison.Ordinal))
            {
                return false;
            }

            string[] parts = customId.Split('_', 5);
            if (parts.Length < 5)
            {
                return false;
            }

            string cacheKey = parts[2];
            string direction = parts[3];
            string userId = parts[4];

            if (!_commitCache.TryGetValue(cacheKey, out CommitData? data))
            {
                _ = component.RespondAsync("This commit preview is no longer available.", ephemeral: true);
                return true;
            }

            int currentIndex = data.CurrentIndex;
            if (direction == "prev")
            {
                data.CurrentIndex = Math.Max(0, currentIndex - 1);
            }
            else if (direction == "next")
            {
                data.CurrentIndex = Math.Min(data.Files.Count - 1, currentIndex + 1);
            }

            _ = component.UpdateAsync(msg =>
            {
                msg.Embed = BuildFileEmbed(data, data.CurrentIndex, data.Url);
                msg.Components = BuildPaginationButtons(cacheKey, data.Files.Count, data.CurrentIndex, userId);
            });

            return true;
        }

        private static string DetectLanguage(string filePath)
        {
            string fileName = filePath.Split('/').Last();
            if (FilenameMap.TryGetValue(fileName, out string? mapped))
            {
                return mapped;
            }
            string ext = Path.GetExtension(fileName).TrimStart('.').ToUpperInvariant();
            return LanguageMap.TryGetValue(ext, out string? lang) ? lang : "diff";
        }

        private static string TruncatePatch(string patch, int maxLines = 30)
        {
            string[] lines = patch.Split('\n');
            return lines.Length <= maxLines ? patch : string.Join('\n', lines.Take(maxLines)) + $"\n... (+{lines.Length - maxLines} more lines)";
        }

        private static Embed BuildFileEmbed(CommitData data, int index, string url)
        {
            CommitFile file = data.Files[index];
            string lang = DetectLanguage(file.Filename);
            string patch = TruncatePatch(file.Patch);

            EmbedBuilder embed = new()
            {
                Title = $"{data.Repository} · {data.Sha[..7]}",
                Url = url,
                Color = Color.Purple,
                Timestamp = DateTimeOffset.UtcNow
            };

            embed.AddField("Message", TruncateText(data.Message, 200), inline: false);
            embed.AddField("Author", data.Author, inline: true);
            embed.AddField("Commit", $"`{data.Sha[..7]}`", inline: true);

            string statusEmoji = file.Status switch
            {
                "added" => "✅",
                "removed" => "❌",
                "modified" => "✏️",
                "renamed" => "🔀",
                _ => "📄"
            };
            embed.AddField("File", $"{statusEmoji} {file.Filename} (+{file.Additions}/-{file.Deletions})", inline: false);

            if (!string.IsNullOrEmpty(patch))
            {
                embed.Description = $"```{lang}\n{patch}\n```";
            }

            return embed.Build();
        }

        private static string TruncateText(string text, int maxLength)
        {
            return text.Length <= maxLength ? text : text[..maxLength] + "...";
        }

        private static MessageComponent? BuildPaginationButtons(string cacheKey, int totalFiles, int currentIndex, string userId)
        {
            if (totalFiles <= 1)
            {
                return null;
            }

            ComponentBuilder builder = new();
            if (currentIndex > 0)
            {
                builder.WithButton("◀ Previous", $"commit_page_{cacheKey}_prev_{userId}", style: ButtonStyle.Secondary);
            }
            if (currentIndex < totalFiles - 1)
            {
                builder.WithButton("Next ▶", $"commit_page_{cacheKey}_next_{userId}", style: ButtonStyle.Secondary);
            }
            return builder.Build();
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot || string.IsNullOrWhiteSpace(message.Content))
            {
                return;
            }

            Match match = CommitLinkRegex().Match(message.Content);
            if (!match.Success)
            {
                return;
            }

            string fullUrl = match.Value;
            string host = match.Groups[1].Value;
            string owner = match.Groups[2].Value;
            string repo = match.Groups[3].Value;
            string sha = match.Groups[4].Value;
            string cacheKey = $"{owner}/{repo}/{sha}";

            if (_commitCache.ContainsKey(cacheKey))
            {
                return;
            }

            try
            {
                string apiUrl = host switch
                {
                    "github.com" or "raw.githubusercontent.com" => $"https://api.github.com/repos/{owner}/{repo}/commits/{sha}",
                    _ => $"https://api.github.com/repos/{owner}/{repo}/commits/{sha}"
                };

                using HttpResponseMessage response = await _http.GetAsync(new Uri(apiUrl)).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    return;
                }

                string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                using JsonDocument doc = JsonDocument.Parse(json);
                JsonElement root = doc.RootElement;

                string messageText = root.GetProperty("commit").GetProperty("message").GetString() ?? "No message";
                string author = root.GetProperty("commit").GetProperty("author").GetProperty("name").GetString() ?? "Unknown";

                List<CommitFile> files = [];
                if (root.TryGetProperty("files", out JsonElement filesElement))
                {
                    foreach (JsonElement file in filesElement.EnumerateArray())
                    {
                        files.Add(new CommitFile
                        {
                            Filename = file.GetProperty("filename").GetString() ?? "unknown",
                            Status = file.GetProperty("status").GetString() ?? "modified",
                            Additions = file.GetProperty("additions").GetInt32(),
                            Deletions = file.GetProperty("deletions").GetInt32(),
                            Patch = file.TryGetProperty("patch", out JsonElement p) ? p.GetString() ?? "" : ""
                        });
                    }
                }

                CommitData data = new()
                {
                    Sha = sha,
                    Repository = $"{owner}/{repo}",
                    Message = messageText,
                    Author = author,
                    Files = files,
                    CurrentIndex = 0,
                    Url = fullUrl
                };

                _commitCache[cacheKey] = data;

                Embed embed = BuildFileEmbed(data, 0, fullUrl);
                MessageComponent? components = BuildPaginationButtons(cacheKey, files.Count, 0, message.Author.Id.ToString(CultureInfo.InvariantCulture));

                if (message.Channel is SocketGuildChannel && message.Author is SocketGuildUser)
                {
                    try
                    {
                        await ((ITextChannel)message.Channel).ModifyMessageAsync(message.Id, props =>
                        {
                            props.Flags = MessageFlags.SuppressEmbeds;
                        }).ConfigureAwait(false);
                    }
                    catch (HttpRequestException)
                    {
                    }
                    catch (InvalidOperationException)
                    {
                    }
                }

                if (components is not null)
                {
                    await message.Channel.SendMessageAsync(embed: embed, components: components).ConfigureAwait(false);
                }
                else
                {
                    await message.Channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
                }
            }
            catch (HttpRequestException ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CommitPreview").ConfigureAwait(false);
            }
            catch (JsonException ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CommitPreview").ConfigureAwait(false);
            }
            catch (TaskCanceledException ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CommitPreview").ConfigureAwait(false);
            }
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }

        internal sealed class CommitFile
        {
            public string Filename { get; set; } = "";
            public string Status { get; set; } = "";
            public int Additions { get; set; }
            public int Deletions { get; set; }
            public string Patch { get; set; } = "";
        }

        internal sealed class CommitData
        {
            public string Sha { get; set; } = "";
            public string Repository { get; set; } = "";
            public string Message { get; set; } = "";
            public string Author { get; set; } = "";
            public List<CommitFile> Files { get; set; } = [];
            public int CurrentIndex { get; set; }
            public string Url { get; set; } = "";
        }
    }
}
