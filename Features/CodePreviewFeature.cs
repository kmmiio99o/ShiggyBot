using System.Globalization;
using System.Text.RegularExpressions;
using Discord;
using Discord.WebSocket;

namespace ShiggyBot.Features
{
    internal sealed partial class CodePreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new();
        private static int _rateLimitRemaining = 60;
        private static long _rateLimitReset;

        private static readonly Dictionary<string, string> LanguageMap = new(StringComparer.OrdinalIgnoreCase)
        {
            { "JS", "javascript" }, { "JSX", "javascript" }, { "MJS", "javascript" }, { "CJS", "javascript" },
            { "TS", "typescript" }, { "TSX", "typescript" }, { "MTS", "typescript" }, { "CTS", "typescript" },
            { "HTML", "html" }, { "HTM", "html" }, { "CSS", "css" }, { "SCSS", "scss" }, { "SASS", "sass" },
            { "VUE", "vue" }, { "SVELTE", "svelte" },
            { "PY", "python" }, { "RB", "ruby" }, { "JAVA", "java" }, { "CS", "csharp" },
            { "CPP", "cpp" }, { "C", "c" }, { "GO", "go" }, { "RS", "rust" }, { "PHP", "php" },
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
            ["Dockerfile"] = "dockerfile",
            ["Makefile"] = "makefile",
            ["CMakeLists.txt"] = "cmake",
            ["Rakefile"] = "ruby",
            ["Gemfile"] = "ruby",
            ["Procfile"] = "text",
            ["Vagrantfile"] = "ruby",
        };

        [GeneratedRegex(@"https?://(?:www\.)?(raw\.githubusercontent\.com|github\.com|gitlab\.com|gitea\.com|forgejo\.com|codeberg\.org|git\.gay|bitbucket\.org)/([^\s/]+)/([^\s/]+)/([^#\s]+)(?:#L(\d+)(?:-L(\d+))?)?", RegexOptions.IgnoreCase)]
        private static partial Regex CodeLinkRegex();

        public CodePreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        private static string ConvertToRawUrl(string host, string owner, string repo, string refStr, string filePath)
        {
            return host switch
            {
                "github.com" or "raw.githubusercontent.com" => $"https://raw.githubusercontent.com/{owner}/{repo}/{refStr}/{filePath}",
                "gitlab.com" => $"https://gitlab.com/{owner}/{repo}/-/raw/{refStr}/{filePath}",
                "gitea.com" => $"https://gitea.com/{owner}/{repo}/raw/{refStr}/{filePath}",
                "forgejo.com" => $"https://forgejo.com/{owner}/{repo}/raw/{refStr}/{filePath}",
                "codeberg.org" => $"https://codeberg.org/{owner}/{repo}/raw/{refStr}/{filePath}",
                "git.gay" => $"https://git.gay/{owner}/{repo}/raw/{refStr}/{filePath}",
                "bitbucket.org" => $"https://bitbucket.org/{owner}/{repo}/raw/{refStr}/{filePath}",
                _ => $"https://raw.githubusercontent.com/{owner}/{repo}/{refStr}/{filePath}"
            };
        }

        private static string DetectLanguage(string filePath)
        {
            string fileName = filePath.Split('/').Last();

            if (FilenameMap.TryGetValue(fileName, out string? mapped))
            {
                return mapped;
            }

            string ext = Path.GetExtension(fileName).TrimStart('.').ToUpperInvariant();

            return LanguageMap.TryGetValue(ext, out string? lang) ? lang : "text";
        }

        private static string Unindent(string code)
        {
            string[] lines = code.Split('\n');
            int minIndent = int.MaxValue;

            foreach (string line in lines)
            {
                string trimmed = line.Trim();

                if (trimmed.Length == 0)
                {
                    continue;
                }

                int indent = line.Length - line.TrimStart().Length;

                if (indent < minIndent)
                {
                    minIndent = indent;
                }
            }

            if (minIndent is int.MaxValue or 0)
            {
                return code;
            }

            for (int i = 0; i < lines.Length; i++)
            {
                if (lines[i].Length >= minIndent)
                {
                    lines[i] = lines[i][minIndent..];
                }
            }

            return string.Join('\n', lines);
        }

        private static async Task<string?> FetchCodeAsync(string url)
        {
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            if (now > _rateLimitReset)
            {
                _rateLimitRemaining = 60;
                _rateLimitReset = now + 3600;
            }

            if (_rateLimitRemaining <= 0)
            {
                long wait = Math.Max(0, _rateLimitReset - now) + 1;
                await Task.Delay((int)(wait * 1000)).ConfigureAwait(false);
            }

            using CancellationTokenSource cts = new(TimeSpan.FromSeconds(15));

            try
            {
                using HttpResponseMessage response = await _http.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false);

                if ((int)response.StatusCode == 429)
                {
                    if (response.Headers.TryGetValues("x-ratelimit-reset", out IEnumerable<string>? values) &&
                        long.TryParse(values.FirstOrDefault(), NumberStyles.Integer, CultureInfo.InvariantCulture, out long reset))
                    {
                        _rateLimitReset = reset;
                    }

                    return null;
                }

                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                long? size = response.Content.Headers.ContentLength;

                return size > 1024 * 1024 ? null : await response.Content.ReadAsStringAsync(cts.Token).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                return null;
            }
            catch (TaskCanceledException)
            {
                return null;
            }
            catch (InvalidOperationException)
            {
                return null;
            }
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot || string.IsNullOrWhiteSpace(message.Content))
            {
                return;
            }

            MatchCollection matches = CodeLinkRegex().Matches(message.Content);

            if (matches.Count == 0)
            {
                return;
            }

            List<Embed> embeds = [];
            HashSet<string> processed = [];

            foreach (Match match in matches.Cast<Match>())
            {
                if (embeds.Count >= 3)
                {
                    break;
                }

                string fullUrl = match.Value;

                if (!processed.Add(fullUrl))
                {
                    continue;
                }

                if (fullUrl.Contains("/releases/download/", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string host = match.Groups[1].Value;
                string owner = match.Groups[2].Value;
                string repo = match.Groups[3].Value;
                string pathSegment = match.Groups[4].Value;
                string startStr = match.Groups[5].Value;
                string endStr = match.Groups[6].Value;

                string[] parts = pathSegment.Split('/');
                int sepIdx = Array.FindIndex(parts, p => p is "blob" or "raw" or "src" or "-/raw");
                string refStr;
                string filePath;

                if (sepIdx != -1 && parts.Length > sepIdx + 2)
                {
                    refStr = parts[sepIdx + 1];
                    filePath = string.Join("/", parts, sepIdx + 2, parts.Length - sepIdx - 2);
                }
                else
                {
                    refStr = parts[0];
                    filePath = string.Join("/", parts.Skip(1));
                }

                int startLine = string.IsNullOrEmpty(startStr) ? 1 : int.Parse(startStr, CultureInfo.InvariantCulture);
                int endLine = string.IsNullOrEmpty(endStr) ? startLine + 19 : int.Parse(endStr, CultureInfo.InvariantCulture);

                string rawUrl = ConvertToRawUrl(host, owner, repo, refStr, filePath);
                string? code = await FetchCodeAsync(rawUrl).ConfigureAwait(false);

                if (code is null)
                {
                    continue;
                }

                string lang = DetectLanguage(filePath);
                string[] lines = code.Split('\n');
                int actualStart = Math.Max(1, Math.Min(startLine, lines.Length));
                int actualEnd = Math.Min(actualStart + 19, Math.Min(endLine, lines.Length));
                string snippet = string.Join('\n', lines, actualStart - 1, actualEnd - actualStart + 1);

                Embed embed = new EmbedBuilder()
                {
                    Title = $"📄 {filePath.Split('/').Last()} [L{startLine}{(startLine != endLine ? "-L" + endLine : "")}]",
                    Url = fullUrl,
                    Color = new Color(0x5865F2),
                    Description = $"```{lang}\n{Unindent(snippet)}\n```",
                    Timestamp = DateTimeOffset.UtcNow
                }
                    .AddField("Repository", $"[{owner}/{repo}]({fullUrl.Split('#')[0]})", inline: true)
                    .AddField("Branch", $"`{refStr}`", inline: true)
                    .AddField("Path", $"`{filePath}`", inline: false)
                    .WithFooter($"{host} • {lang.ToUpperInvariant()} • {actualEnd - actualStart + 1} lines")
                    .Build();

                embeds.Add(embed);
            }

            if (embeds.Count > 0)
            {
                if (message.Channel is SocketGuildChannel)
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

                await message.Channel.SendMessageAsync(embeds: [.. embeds]).ConfigureAwait(false);
            }
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }
    }
}
