import type { MessageModule, ModuleMeta } from "../index";
import {
  addToolResult,
  clearAssistantHistory,
  planAssistantAction,
} from "../../assistant/client";
import { executeAssistantTool } from "../../assistant/tools";
import { isAssistantEnabled, setAssistantEnabled } from "../../assistant/state";

export const meta: ModuleMeta = {
  name: "ai",
  description:
    "Aktifkan atau nonaktifkan AI assistant untuk pengguna ini di chat.",
  usage: "on | off | status",
};

export const onMessage: MessageModule = async ({
  message,
  modules,
  aiTools,
}) => {
  const userKey = `${message.chatId}:${message.sender || message.chatId}`;
  const command = message.command();
  if (command?.name === "ai") {
    const action = command.args[0]?.toLowerCase();
    if (action === "on") {
      await setAssistantEnabled(userKey, true);
      clearAssistantHistory(userKey);
      await message.reply(
        "AI assistant aktif untuk Anda di chat ini. Jelaskan apa yang ingin dilakukan.",
      );
      return;
    }
    if (action === "off") {
      await setAssistantEnabled(userKey, false);
      clearAssistantHistory(userKey);
      await message.reply(
        "AI assistant nonaktif untuk Anda. Command biasa tetap berjalan seperti sebelumnya.",
      );
      return;
    }
    if (action === "status") {
      const enabled = await isAssistantEnabled(userKey);
      await message.reply(
        `AI assistant untuk Anda saat ini ${enabled ? "aktif" : "nonaktif"} di chat ini.`,
      );
      return;
    }
    await message.reply(
      "Gunakan: .ai on, .ai off, atau .ai status (prefix mengikuti konfigurasi bot).",
    );
    return;
  }

  if (!(await isAssistantEnabled(userKey)) || command) return;

  try {
    await message.typing(500);
    const { plan } = await planAssistantAction(userKey, message, aiTools);
    let response = plan.response;
    if (plan.action === "tool") {
      response = await executeAssistantTool(plan, {
        message,
        modules,
        aiTools,
      });
      addToolResult(userKey, response);
    }
    if (response.trim()) await message.reply(response);
  } catch (error) {
    console.error("AI assistant gagal:", error);
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("fetch failed") || detail.includes("ECONNREFUSED")) {
      await message.reply(
        "Ollama tidak bisa diakses. Pastikan Ollama berjalan di OLLAMA_BASE_URL.",
      );
    } else if (detail.includes("not found") || detail.includes("pull")) {
      await message.reply(
        `Model Ollama tidak ditemukan. Jalankan: ollama pull ${process.env.OLLAMA_MODEL || "gemma3:4b"}`,
      );
    } else {
      await message.reply(`AI assistant gagal memproses permintaan: ${detail}`);
    }
  }
};
