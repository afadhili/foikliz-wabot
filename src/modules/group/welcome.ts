import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "welcome",
  active: true,
  description: "Atur salam untuk anggota baru grup.",
  usage: "on|off [template dengan {user} dan {group}]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "welcome") return;
  if (!(await requireGroupAdmin(message))) return;
  const [action, ...parts] = command.args;
  if ((action !== "on" && action !== "off") || (action === "off" && parts.length)) {
    await message.reply(`Penggunaan: ${command.prefix}welcome ${meta.usage}`);
    return;
  }
  const setting = (await updateGroupSettings(message.chatId, (config) => {
    config.welcome.enabled = action === "on";
    if (parts.length) config.welcome.template = parts.join(" ");
  })).welcome;
  await message.reply(`Welcome ${setting.enabled ? "aktif" : "nonaktif"}. Template: ${setting.template}`);
};
