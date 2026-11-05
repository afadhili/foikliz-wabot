import { normalizeDomain, requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "antilink",
  active: true,
  description: "Hapus hanya link dari domain yang ditentukan (termasuk subdomain).",
  usage: "on|off [domain1 domain2 ...]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "antilink") return;
  if (!(await requireGroupAdmin(message))) return;
  const [action, ...raw] = command.args;
  const inputs = raw.flatMap((part) => part.split(",")).filter(Boolean);
  const domains = inputs.map(normalizeDomain);
  if ((action !== "on" && action !== "off") || (action === "off" && raw.length) || domains.some((value) => !value)) {
    await message.reply(`Penggunaan: ${command.prefix}antilink ${meta.usage}\nGunakan nama domain saja, misalnya example.com.`);
    return;
  }
  const setting = (await updateGroupSettings(message.chatId, (config) => {
    config.antilink.enabled = action === "on";
    if (domains.length) config.antilink.domains = [...new Set(domains as string[])];
  })).antilink;
  await message.reply(`Antilink ${setting.enabled ? "aktif" : "nonaktif"}. Domain: ${setting.domains.join(", ") || "belum diatur; tidak ada link yang dihapus"}.`);
};
