import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "close", active: true, description: "Batasi pengiriman pesan hanya untuk admin.", usage: "",
};

export const onMessage: MessageModule = async (context) => {
  if (context.message.command()?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    await socket.groupSettingUpdate(message.chatId, "announcement");
    await message.reply("Grup ditutup; hanya admin dapat mengirim pesan.");
  });
};
