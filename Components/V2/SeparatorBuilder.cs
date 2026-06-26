using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a Separator component — vertical padding and optional divider between components.</summary>
    internal sealed class SeparatorBuilder : IV2ComponentBuilder
    {
        private bool _divider = true;
        private SeparatorSpacing _spacing = SeparatorSpacing.Small;

        /// <summary>Sets whether a visual divider line is shown.</summary>
        public SeparatorBuilder WithDivider(bool divider)
        {
            _divider = divider;
            return this;
        }

        /// <summary>Sets the spacing size.</summary>
        public SeparatorBuilder WithSpacing(SeparatorSpacing spacing)
        {
            _spacing = spacing;
            return this;
        }

        /// <summary>Writes this Separator as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.Separator);
            if (!_divider)
            {
                writer.WriteBoolean("divider", false);
            }

            writer.WriteNumber("spacing", (int)_spacing);
            writer.WriteEndObject();
        }
    }
}
