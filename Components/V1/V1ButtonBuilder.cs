using System.Text.Json;

namespace ShiggyBot.Components.V1
{
    internal enum ButtonStyle
    {
        Primary = 1,
        Secondary = 2,
        Success = 3,
        Danger = 4,
        Link = 5,
    }

    internal sealed class V1ButtonBuilder : IV1Component
    {
        private ButtonStyle _style;
        private string? _label;
        private string? _customId;
        private string? _url;
        private string? _emojiName;
        private string? _emojiId;
        private bool _emojiAnimated;
        private bool _disabled;

        public V1ButtonBuilder WithStyle(ButtonStyle style) { _style = style; return this; }
        public V1ButtonBuilder WithLabel(string label) { _label = label; return this; }
        public V1ButtonBuilder WithCustomId(string customId) { _customId = customId; return this; }
        public V1ButtonBuilder WithUrl(string url) { _url = url; return this; }
        public V1ButtonBuilder WithEmoji(string name, string? id = null, bool animated = false) { _emojiName = name; _emojiId = id; _emojiAnimated = animated; return this; }
        public V1ButtonBuilder WithDisabled(bool disabled = true) { _disabled = disabled; return this; }

        public void Write(Utf8JsonWriter writer)
        {
            writer.WriteStartObject();
            writer.WriteNumber("type", 2);
            writer.WriteNumber("style", (int)_style);

            if (_label is not null)
            {
                writer.WriteString("label", _label);
            }

            if (_style == ButtonStyle.Link)
            {
                writer.WriteString("url", _url ?? "#");
            }
            else
            {
                writer.WriteString("custom_id", _customId ?? Guid.NewGuid().ToString("N"));
            }

            if (_emojiName is not null)
            {
                writer.WriteStartObject("emoji");
                writer.WriteString("name", _emojiName);
                if (_emojiId is not null)
                {
                    writer.WriteString("id", _emojiId);
                }

                if (_emojiAnimated)
                {
                    writer.WriteBoolean("animated", true);
                }

                writer.WriteEndObject();
            }

            if (_disabled)
            {
                writer.WriteBoolean("disabled", true);
            }

            writer.WriteEndObject();
        }
    }
}
