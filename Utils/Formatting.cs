namespace ShiggyBot.Utils
{
    internal static class Formatting
    {
        public static int CountDigits(int value)
        {
            if (value < 0)
            {
                value = -value;
            }

            return value switch
            {
                < 10 => 1,
                < 100 => 2,
                < 1000 => 3,
                < 10000 => 4,
                < 100000 => 5,
                < 1000000 => 6,
                < 10000000 => 7,
                < 100000000 => 8,
                < 1000000000 => 9,
                _ => 10
            };
        }

        public static int WriteInt32(byte[] buffer, int offset, int value)
        {
            Span<byte> digits = stackalloc byte[11];
            int len = 0;
            int n = value;

            do
            {
                digits[len++] = (byte)('0' + (n % 10));
                n /= 10;
            }
            while (n > 0);

            for (int i = 0; i < (len / 2); i++)
            {
                (digits[i], digits[len - 1 - i]) = (digits[len - 1 - i], digits[i]);
            }

            digits[..len].CopyTo(buffer.AsSpan(offset));
            return offset + len;
        }
    }
}
