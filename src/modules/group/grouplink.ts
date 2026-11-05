import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "grouplink", active: true, description: "Tampilkan tautan undangan grup (khusus admin).", usage: "",
};

export const onMessage: MessageModule = async (context) => {
  if (context.message.command()?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    const code = await socket.groupInviteCode(message.chatId);
    await message.reply(code ? `https://chat.whatsapp.com/${code}` : "Gagal mengambil tautan grup.");
  });
};
