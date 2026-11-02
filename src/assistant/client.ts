import type { ParsedMessage } from "../parser";
import type { LoadedMessageModule } from "../modules";

export interface AssistantPlan {
  action: "reply" | "tool";
  tool: string;
  args: Record<string, unknown>;
  response: string;
}

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const conversations = new Map<string, ConversationMessage[]>();
const MAX_HISTORY_MESSAGES = 15;

function makeSystemPrompt(tools: LoadedMessageModule[]): string {
  const definitions = tools
    .filter((module) => module.meta?.ai && module.executeAI)
    .map(({ meta }) => {
      const ai = meta!.ai!;
      return [
        `Tool: ${meta!.name}`,
        `Description: ${ai.description}`,
        `Parameters: ${JSON.stringify(ai.parameters)}`,
        ai.requirements?.length
          ? `Requirements: ${ai.requirements.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

  return `Kamu adalah asisten WhatsApp berbahasa Indonesia. Balas sebagai satu objek JSON sesuai schema.

Tools yang tersedia:
${definitions.length ? definitions.join("\n\n") : "Tidak ada tool tersedia."}

Aturan:
- Pilih hanya nama tool yang tercantum di atas; jangan mengarang tool atau parameter.
- Panggil tool hanya jika pengguna jelas meminta aksi. Percakapan biasa gunakan action=reply dan tool=none.
- Jika parameter wajib atau syarat penggunaan belum terpenuhi, jangan panggil tool. Gunakan action=reply untuk meminta informasi yang kurang.
- Pesan terbaru diberikan sebagai JSON berisi text, media, dan quoted. Gunakan metadata tersebut sebagai fakta tentang pesan saat ini.
- Jika media.present=true atau quoted.media.present=true, media sudah tersedia; jangan meminta pengguna mengirimnya lagi. Pilih tool yang sesuai dengan jenis media dan permintaan pengguna.
- Jangan mengarang URL atau memakai URL yang tidak diberikan/dikonfirmasi pengguna.
- Isi response harus ringkas dalam Bahasa Indonesia. Untuk tool call yang valid, response boleh kosong.`;
}

function makePlanSchema(tools: LoadedMessageModule[]) {
  const names = tools
    .filter((module) => module.meta?.ai && module.executeAI)
    .map((module) => module.meta!.name);
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: ["reply", "tool"] },
      tool: { type: "string", enum: ["none", ...names] },
      args: { type: "object", additionalProperties: true },
      response: { type: "string" },
    },
    required: ["action", "tool", "args", "response"],
    additionalProperties: false,
  };
}

function parsePlan(
  content: string,
  tools: LoadedMessageModule[],
): AssistantPlan {
  const parsed = JSON.parse(content) as Partial<AssistantPlan>;
  const validTools = new Set([
    "none",
    ...tools
      .filter((module) => module.meta?.ai && module.executeAI)
      .map((module) => module.meta!.name),
  ]);
  if (
    (parsed.action !== "reply" && parsed.action !== "tool") ||
    typeof parsed.tool !== "string" ||
    !validTools.has(parsed.tool) ||
    !parsed.args ||
    typeof parsed.args !== "object" ||
    Array.isArray(parsed.args) ||
    typeof parsed.response !== "string"
  ) {
    throw new Error("Ollama mengembalikan rencana yang tidak valid.");
  }
  return parsed as AssistantPlan;
}

function serializeMessageContext(message: ParsedMessage): string {
  const context = {
    text: message.text.slice(0, 4000),
    isGroup: message.isGroup,
    media: {
      present: message.hasMedia,
      type: message.hasMedia ? message.type : null,
      mimetype: message.hasMedia ? (message.mimetype ?? null) : null,
    },
    quoted: message.quoted
      ? {
          text: message.quoted.text.slice(0, 2000),
          media: {
            present: message.quoted.hasMedia,
            type: message.quoted.hasMedia
              ? (message.quoted.type ?? null)
              : null,
            mimetype: message.quoted.hasMedia
              ? (message.quoted.mimetype ?? null)
              : null,
          },
        }
      : null,
  };
  return JSON.stringify(context);
}

export async function planAssistantAction(
  chatId: string,
  userMessage: ParsedMessage,
  tools: LoadedMessageModule[],
): Promise<{ plan: AssistantPlan }> {
  const history = conversations.get(chatId) ?? [];
  const serializedMessage = serializeMessageContext(userMessage);
  const messages = [
    { role: "system", content: makeSystemPrompt(tools) },
    ...history.slice(-MAX_HISTORY_MESSAGES),
    { role: "user", content: serializedMessage },
  ];

  const baseUrl = (
    process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "gemma3:4b",
      messages,
      stream: false,
      think: false,
      format: makePlanSchema(tools),
      options: { temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const data = (await response.json()) as {
    message?: { content?: string };
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      data.error ?? `Ollama gagal merespons (${response.status}).`,
    );
  }
  if (!data.message?.content) throw new Error("Ollama tidak mengirim rencana.");

  const plan = parsePlan(data.message.content, tools);
  history.push(
    { role: "user", content: serializedMessage },
    {
      role: "assistant",
      content: plan.action === "tool" ? `[tool:${plan.tool}]` : plan.response,
    },
  );
  conversations.set(chatId, history.slice(-MAX_HISTORY_MESSAGES));
  return { plan };
}

export function addToolResult(chatId: string, result: string) {
  const history = conversations.get(chatId) ?? [];
  const lastMessage = history.at(-1);
  if (
    lastMessage?.role === "assistant" &&
    lastMessage.content.startsWith("[tool:")
  ) {
    lastMessage.content = result;
  } else {
    history.push({ role: "assistant", content: result });
  }
  conversations.set(chatId, history.slice(-MAX_HISTORY_MESSAGES));
}

export function clearAssistantHistory(chatId: string) {
  conversations.delete(chatId);
}
