import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "antisticker",
  active: true,
  description: "Hapus stiker dari anggota non-admin.",
  usage: "on|off",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "antisticker") return;
  if (!(await requireGroupAdmin(message))) return;
  if (command.args.length !== 1 || !["on", "off"].includes(command.args[0]!)) {
    await message.reply(`Penggunaan: ${command.prefix}antisticker ${meta.usage}`);
    return;
  }
  const setting = await updateGroupSettings(message.chatId, (config) => {
    config.antisticker = command.args[0] === "on";
  });
  await message.reply(`Antisticker ${setting.antisticker ? "aktif" : "nonaktif"}.`);
};
