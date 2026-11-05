import { createManagedBot, isPrimarySocket } from "../../bot-manager";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "newbot",
  active: true,
  ownerOnly: true,
  description: "Buat koneksi bot WhatsApp terpisah dengan pairing code.",
  usage: ".newbot <nomor E.164>",
};

export const onMessage: MessageModule = async ({ message, socket }) => {
  if (message.isGroup) return;
  if (!isPrimarySocket(socket)) return;
  if (message.command()?.args.length !== 1) {
    await message.reply("Format: .newbot <nomor E.164>");
    return;
  }
  try {
    await createManagedBot(message.command()!.args[0]!, message.chatId);
  } catch (error) {
    await message.reply(error instanceof Error ? error.message : "Gagal membuat bot.");
  }
};
