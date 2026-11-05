import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "setdesc", active: true, description: "Ubah deskripsi grup.", usage: "deskripsi baru",
};

export const onMessage: MessageModule = async (context) => {
  const command = context.message.command();
  if (command?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    const description = command.rest.trim();
    if (!description) {
      await message.reply(`Format: ${command.prefix}setdesc ${meta.usage}`);
      return;
    }
    await socket.groupUpdateDescription(message.chatId, description);
    await message.reply("Deskripsi grup berhasil diubah.");
  });
};
