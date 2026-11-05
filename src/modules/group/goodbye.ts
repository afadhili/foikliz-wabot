import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "goodbye",
  active: true,
  description: "Atur salam untuk anggota yang keluar dari grup.",
  usage: "on|off [template dengan {user} dan {group}]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "goodbye") return;
  if (!(await requireGroupAdmin(message))) return;
  const [action, ...parts] = command.args;
  if ((action !== "on" && action !== "off") || (action === "off" && parts.length)) {
    await message.reply(`Penggunaan: ${command.prefix}goodbye ${meta.usage}`);
    return;
  }
  const setting = (await updateGroupSettings(message.chatId, (config) => {
    config.goodbye.enabled = action === "on";
    if (parts.length) config.goodbye.template = parts.join(" ");
  })).goodbye;
  await message.reply(`Goodbye ${setting.enabled ? "aktif" : "nonaktif"}. Template: ${setting.template}`);
};
