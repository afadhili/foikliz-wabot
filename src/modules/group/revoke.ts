import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "revoke", active: true, description: "Perbarui tautan undangan grup.", usage: "",
};

export const onMessage: MessageModule = async (context) => {
  if (context.message.command()?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    const code = await socket.groupRevokeInvite(message.chatId);
    await message.reply(code ? `Tautan baru: https://chat.whatsapp.com/${code}` : "Gagal memperbarui tautan grup.");
  });
};
