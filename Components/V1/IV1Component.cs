using System.Text.Json;

namespace ShiggyBot.Components.V1
{
    internal interface IV1Component
    {
        void Write(Utf8JsonWriter writer);
    }
}
