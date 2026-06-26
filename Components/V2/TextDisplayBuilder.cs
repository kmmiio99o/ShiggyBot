using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a TextDisplay component — static markdown-formatted text.</summary>
    internal sealed class TextDisplayBuilder : IV2ComponentBuilder
    {
        private string? _content;

        /// <summary>Sets the markdown content of the text display.</summary>
        public TextDisplayBuilder WithContent(string content)
        {
            _content = content;
            return this;
        }

        /// <summary>Writes this TextDisplay as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.TextDisplay);
            if (_content is not null)
            {
                writer.WriteString("content", _content);
            }

            writer.WriteEndObject();
        }
    }
}
