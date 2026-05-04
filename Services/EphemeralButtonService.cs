using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Discord.WebSocket;

namespace ShiggyBot.Services
{
    public static class EphemeralButtonService
    {
        private static readonly ConcurrentDictionary<string, Func<SocketMessageComponent, Task>> _handlers = new();

        // Register a one-shot ephemeral handler for a specific button (customId).
        public static void Register(string key, Func<SocketMessageComponent, Task> handler)
        {
            _handlers[key] = handler;
        }

        // Try to handle an incoming button interaction. If handled, returns true.
        public static bool TryHandle(SocketMessageComponent component)
        {
            if (component?.Data?.CustomId == null) return false;
            var key = component.Data.CustomId;
            if (_handlers.TryRemove(key, out var handler))
            {
                // Fire and forget; ensure we don't block the interaction pipeline
                _ = handler(component);
                return true;
            }
            return false;
        }
    }
}
