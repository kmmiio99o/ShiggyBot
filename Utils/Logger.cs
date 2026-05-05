namespace ShiggyBot.Utils
{
    // Lightweight logger to centralize simple logging and avoid sprinkling Console.WriteLine
    internal static class Logger
    {
        public static void Info(string message)
        {
            Console.WriteLine($"[INFO] {message}");
        }

        public static void Warn(string message)
        {
            Console.WriteLine($"[WARN] {message}");
        }

        public static void Error(string message, Exception? ex = null)
        {
            Console.WriteLine($"[ERROR] {message}");
            if (ex != null)
            {
                Console.WriteLine(ex);
            }
        }
    }
}
