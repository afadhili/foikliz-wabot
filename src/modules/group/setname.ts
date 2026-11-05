import type { MessageModule, ModuleMeta } from "../index";
import { withGroupAccess } from "./management";

export const meta: ModuleMeta = {
  name: "setname", active: true, description: "Ubah nama grup.", usage: "nama baru",
};

export const onMessage: MessageModule = async (context) => {
  const command = context.message.command();
  if (command?.name !== meta.name) return;
  await withGroupAccess(context, async ({ message, socket }) => {
    const name = command.rest.trim();
    if (!name) {
      await message.reply(`Format: ${command.prefix}setname ${meta.usage}`);
      return;
    }
    await socket.groupUpdateSubject(message.chatId, name);
    await message.reply("Nama grup berhasil diubah.");
  });
};
