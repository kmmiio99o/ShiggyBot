using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a Section component — groups text displays with an accessory (thumbnail or button).</summary>
    internal sealed class SectionBuilder : IV2ComponentBuilder
    {
        private readonly List<TextDisplayBuilder> _textComponents = [];
        private ThumbnailBuilder? _thumbnailAccessory;
        private SectionButtonAccessory? _buttonAccessory;

        /// <summary>Adds a text display to the section.</summary>
        public SectionBuilder AddTextDisplay(TextDisplayBuilder textDisplay)
        {
            _textComponents.Add(textDisplay);
            return this;
        }

        /// <summary>Sets a thumbnail as the section accessory.</summary>
        public SectionBuilder WithThumbnailAccessory(ThumbnailBuilder thumbnail)
        {
            _thumbnailAccessory = thumbnail;
            _buttonAccessory = null;
            return this;
        }

        /// <summary>Sets a button as the section accessory.</summary>
        public SectionBuilder WithButtonAccessory(string label, string customId)
        {
            _buttonAccessory = new SectionButtonAccessory(label, customId, null);
            _thumbnailAccessory = null;
            return this;
        }

        /// <summary>Sets a link button as the section accessory.</summary>
        public SectionBuilder WithLinkButtonAccessory(string label, Uri url)
        {
            _buttonAccessory = new SectionButtonAccessory(label, null, url);
            _thumbnailAccessory = null;
            return this;
        }

        /// <summary>Writes this Section as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.Section);
            writer.WriteStartArray("components");
            foreach (TextDisplayBuilder text in _textComponents)
            {
                text.Write(writer);
            }

            writer.WriteEndArray();
            if (_thumbnailAccessory is not null)
            {
                writer.WritePropertyName("accessory");
                _thumbnailAccessory.Write(writer);
            }
            else if (_buttonAccessory is not null)
            {
                writer.WritePropertyName("accessory");
                _buttonAccessory.Value.Write(writer);
            }

            writer.WriteEndObject();
        }

        private readonly struct SectionButtonAccessory
        {
            private readonly string _label;
            private readonly string? _customId;
            private readonly Uri? _url;

            internal SectionButtonAccessory(string label, string? customId, Uri? url)
            {
                _label = label;
                _customId = customId;
                _url = url;
            }

            public void Write(Utf8JsonWriter writer)
            {
                ArgumentNullException.ThrowIfNull(writer);
                writer.WriteStartObject();
                writer.WriteNumber("type", (int)ComponentType.Button);
                writer.WriteString("label", _label);
                if (_url is not null)
                {
                    writer.WriteNumber("style", 5);
                    writer.WriteString("url", _url.ToString());
                }
                else
                {
                    writer.WriteNumber("style", 1);
                    writer.WriteString("custom_id", _customId);
                }

                writer.WriteEndObject();
            }
        }
    }
}
