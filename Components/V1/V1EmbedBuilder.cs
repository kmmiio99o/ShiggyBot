using System.Text.Json;

namespace ShiggyBot.Components.V1
{
    internal sealed class V1EmbedBuilder
    {
        private string? _title;
        private string? _description;
        private string? _url;
        private int _color;
        private string? _imageUrl;
        private string? _thumbnailUrl;
        private string? _authorName;
        private string? _authorIconUrl;
        private string? _authorUrl;
        private string? _footerText;
        private string? _footerIconUrl;
        private DateTimeOffset? _timestamp;
        private readonly List<EmbedField> _fields = [];

        public V1EmbedBuilder WithTitle(string title) { _title = title; return this; }
        public V1EmbedBuilder WithDescription(string description) { _description = description; return this; }
        public V1EmbedBuilder WithUrl(string url) { _url = url; return this; }
        public V1EmbedBuilder WithColor(int color) { _color = color; return this; }
        public V1EmbedBuilder WithImage(string url) { _imageUrl = url; return this; }
        public V1EmbedBuilder WithThumbnail(string url) { _thumbnailUrl = url; return this; }
        public V1EmbedBuilder WithAuthor(string name, string? iconUrl = null, string? url = null) { _authorName = name; _authorIconUrl = iconUrl; _authorUrl = url; return this; }
        public V1EmbedBuilder WithFooter(string text, string? iconUrl = null) { _footerText = text; _footerIconUrl = iconUrl; return this; }
        public V1EmbedBuilder WithTimestamp(DateTimeOffset timestamp) { _timestamp = timestamp; return this; }
        public V1EmbedBuilder AddField(string name, string value, bool inline = false) { _fields.Add(new EmbedField(name, value, inline)); return this; }

        public void Write(Utf8JsonWriter writer)
        {
            writer.WriteStartObject();

            if (_title is not null)
            {
                writer.WriteString("title", _title);
            }

            if (_description is not null)
            {
                writer.WriteString("description", _description);
            }

            if (_url is not null)
            {
                writer.WriteString("url", _url);
            }

            if (_color != 0)
            {
                writer.WriteNumber("color", _color);
            }

            if (_timestamp is not null)
            {
                writer.WriteString("timestamp", _timestamp.Value.ToString("O"));
            }

            if (_imageUrl is not null)
            {
                writer.WriteStartObject("image");
                writer.WriteString("url", _imageUrl);
                writer.WriteEndObject();
            }

            if (_thumbnailUrl is not null)
            {
                writer.WriteStartObject("thumbnail");
                writer.WriteString("url", _thumbnailUrl);
                writer.WriteEndObject();
            }

            if (_authorName is not null)
            {
                writer.WriteStartObject("author");
                writer.WriteString("name", _authorName);
                if (_authorIconUrl is not null)
                {
                    writer.WriteString("icon_url", _authorIconUrl);
                }

                if (_authorUrl is not null)
                {
                    writer.WriteString("url", _authorUrl);
                }

                writer.WriteEndObject();
            }

            if (_footerText is not null)
            {
                writer.WriteStartObject("footer");
                writer.WriteString("text", _footerText);
                if (_footerIconUrl is not null)
                {
                    writer.WriteString("icon_url", _footerIconUrl);
                }

                writer.WriteEndObject();
            }

            if (_fields.Count > 0)
            {
                writer.WriteStartArray("fields");
                foreach (EmbedField field in _fields)
                {
                    writer.WriteStartObject();
                    writer.WriteString("name", field.Name);
                    writer.WriteString("value", field.Value);
                    if (field.Inline)
                    {
                        writer.WriteBoolean("inline", true);
                    }

                    writer.WriteEndObject();
                }
                writer.WriteEndArray();
            }

            writer.WriteEndObject();
        }

        private readonly record struct EmbedField(string Name, string Value, bool Inline);
    }
}
