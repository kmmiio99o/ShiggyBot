import { config } from "../config/index.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const HF_BASE = "https://api-inference.huggingface.co/models";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const conversationHistory = new Map<string, Message[]>();

function isGroq(): boolean {
  return !!process.env.GROQ_API_KEY;
}

function isHuggingFace(): boolean {
  return (
    !!process.env.HUGGINGFACE_API_KEY &&
    !isGroq() &&
    !process.env.OPENROUTER_API_KEY
  );
}

export async function chatWithGemini(
  prompt: string,
  userId: string,
  includeHistory = true,
): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  let history: Message[] = [];
  if (includeHistory) {
    history = conversationHistory.get(userId) || [];
  }

  const messages: Message[] = [...history, { role: "user", content: prompt }];

  let url: string;
  let headers: Record<string, string>;
  let body: object;

  if (isGroq()) {
    url = `${GROQ_BASE}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      model: "llama-3.1-8b-instant",
      messages,
    };
  } else if (isHuggingFace()) {
    url = `${HF_BASE}/meta-llama/Llama-3.1-8B-Instruct/v1/chat-completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      messages,
      max_tokens: 512,
    };
  } else {
    url = `${OPENROUTER_BASE}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://shiggybot.dev",
      "X-Title": "ShiggyBot",
    };
    body = {
      model: "google/gemini-2.0-flash-001",
      messages,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const provider = isGroq()
      ? "Groq"
      : isHuggingFace()
        ? "HuggingFace"
        : "OpenRouter";
    throw new Error(`${provider} API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  if (data.choices && data.choices[0]?.message?.content) {
    const assistantResponse = data.choices[0].message.content;

    if (includeHistory) {
      const newHistory = [
        ...messages,
        { role: "assistant" as const, content: assistantResponse },
      ];
      conversationHistory.set(userId, newHistory.slice(-20));
    }

    return assistantResponse;
  }

  throw new Error("Invalid response from AI API");
}

export function clearHistory(userId: string): void {
  conversationHistory.delete(userId);
}
