using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a Container component — groups components visually with an optional accent color.</summary>
    internal sealed class ContainerBuilder : IV2ComponentBuilder
    {
        private readonly List<IV2ComponentBuilder> _components = [];
        private int? _accentColor;
        private bool _spoiler;

        /// <summary>Adds a child component to the container.</summary>
        public ContainerBuilder AddComponent(IV2ComponentBuilder component)
        {
            _components.Add(component);
            return this;
        }

        /// <summary>Sets the accent color for the container (RGB 0x000000–0xFFFFFF).</summary>
        public ContainerBuilder WithAccentColor(int color)
        {
            _accentColor = color;
            return this;
        }

        /// <summary>Marks the container as a spoiler.</summary>
        public ContainerBuilder AsSpoiler(bool spoiler = true)
        {
            _spoiler = spoiler;
            return this;
        }

        /// <summary>Writes this Container as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.Container);
            if (_accentColor.HasValue)
            {
                writer.WriteNumber("accent_color", _accentColor.Value);
            }

            writer.WriteStartArray("components");
            foreach (IV2ComponentBuilder component in _components)
            {
                component.Write(writer);
            }

            writer.WriteEndArray();
            if (_spoiler)
            {
                writer.WriteBoolean("spoiler", true);
            }

            writer.WriteEndObject();
        }
    }
}
