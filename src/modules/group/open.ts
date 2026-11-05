import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "open", active: true, description: "Izinkan semua anggota mengirim pesan.", usage: "",
};

export const onMessage: MessageModule = async (context) => {
  if (context.message.command()?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    await socket.groupSettingUpdate(message.chatId, "not_announcement");
    await message.reply("Grup dibuka untuk semua anggota.");
  });
};
