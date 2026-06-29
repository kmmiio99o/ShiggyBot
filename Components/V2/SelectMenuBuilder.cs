using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a V1 select menu component (type 3).</summary>
    internal sealed class SelectMenuBuilder : IV2ComponentBuilder
    {
        private string? _customId;
        private string? _placeholder;
        private int _minValues = 1;
        private int _maxValues = 1;
        private readonly List<SelectOption> _options = [];

        /// <summary>Sets the custom ID for the select menu.</summary>
        public SelectMenuBuilder WithCustomId(string customId)
        {
            _customId = customId;
            return this;
        }

        /// <summary>Sets the placeholder text.</summary>
        public SelectMenuBuilder WithPlaceholder(string placeholder)
        {
            _placeholder = placeholder;
            return this;
        }

        /// <summary>Sets the minimum number of selections required.</summary>
        public SelectMenuBuilder WithMinValues(int minValues)
        {
            _minValues = minValues;
            return this;
        }

        /// <summary>Sets the maximum number of selections allowed.</summary>
        public SelectMenuBuilder WithMaxValues(int maxValues)
        {
            _maxValues = maxValues;
            return this;
        }

        /// <summary>Adds an option to the select menu.</summary>
        public SelectMenuBuilder AddOption(string label, string value, string? description = null, string? emojiName = null)
        {
            _options.Add(new SelectOption(label, value, description, emojiName));
            return this;
        }

        /// <summary>Writes this SelectMenu as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", 3);
            writer.WriteString("custom_id", _customId);
            if (_placeholder is not null)
            {
                writer.WriteString("placeholder", _placeholder);
            }

            writer.WriteNumber("min_values", _minValues);
            writer.WriteNumber("max_values", _maxValues);
            writer.WriteStartArray("options");
            foreach (SelectOption option in _options)
            {
                option.Write(writer);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        private readonly struct SelectOption
        {
            private readonly string _label;
            private readonly string _value;
            private readonly string? _description;
            private readonly string? _emojiName;

            internal SelectOption(string label, string value, string? description, string? emojiName)
            {
                _label = label;
                _value = value;
                _description = description;
                _emojiName = emojiName;
            }

            public void Write(Utf8JsonWriter writer)
            {
                writer.WriteStartObject();
                writer.WriteString("label", _label);
                writer.WriteString("value", _value);
                writer.WriteString("description", _description ?? "");
                if (_emojiName is not null)
                {
                    writer.WriteStartObject("emoji");
                    writer.WriteString("name", _emojiName);
                    writer.WriteEndObject();
                }

                writer.WriteEndObject();
            }
        }
    }
}
