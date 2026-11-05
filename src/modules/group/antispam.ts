import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "antispam",
  active: true,
  description: "Hapus pesan beruntun (8 pesan dalam 10 detik).",
  usage: "on|off",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "antispam") return;
  if (!(await requireGroupAdmin(message))) return;
  if (command.args.length !== 1 || !["on", "off"].includes(command.args[0]!)) {
    await message.reply(`Penggunaan: ${command.prefix}antispam ${meta.usage}`);
    return;
  }
  const setting = await updateGroupSettings(message.chatId, (config) => {
    config.antispam = command.args[0] === "on";
  });
  await message.reply(`Antispam ${setting.antispam ? "aktif" : "nonaktif"}.`);
};
