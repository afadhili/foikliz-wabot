import { isPrimarySocket, removeManagedBot } from "../../bot-manager";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "rmbot",
  active: true,
  ownerOnly: true,
  description: "Hentikan dan hapus sesi bot terkelola.",
  usage: ".rmbot <nomor E.164>",
};

export const onMessage: MessageModule = async ({ message, socket }) => {
  if (message.isGroup) return;
  if (!isPrimarySocket(socket)) return;
  const args = message.command()?.args ?? [];
  if (args.length !== 1) {
    await message.reply("Format: .rmbot <nomor E.164>");
    return;
  }
  try {
    await removeManagedBot(args[0]!);
    await message.reply("Bot dihentikan dan sesi lokalnya dihapus.");
  } catch (error) {
    await message.reply(error instanceof Error ? error.message : "Gagal menghapus bot.");
  }
};
