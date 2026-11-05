import { requireGroupAdmin, updateGroupSettings, type MediaType } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

const types: MediaType[] = ["image", "video", "audio", "document"];

export const meta: ModuleMeta = {
  name: "antimedia",
  active: true,
  description: "Hapus jenis media yang dipilih dari anggota non-admin.",
  usage: "on|off [image|video|audio|document]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "antimedia") return;
  if (!(await requireGroupAdmin(message))) return;
  const [action, ...raw] = command.args;
  const selected = raw.flatMap((part) => part.split(",")).filter(Boolean);
  if ((action !== "on" && action !== "off") || selected.some((type) => !types.includes(type as MediaType))) {
    await message.reply(`Penggunaan: ${command.prefix}antimedia ${meta.usage}`);
    return;
  }
  const setting = (await updateGroupSettings(message.chatId, (config) => {
    if (action === "on") {
      config.antimedia.enabled = true;
      config.antimedia.types = selected.length ? [...new Set(selected as MediaType[])] : types;
    } else if (selected.length) {
      config.antimedia.types = config.antimedia.types.filter((type) => !selected.includes(type));
      if (!config.antimedia.types.length) config.antimedia.enabled = false;
    } else {
      config.antimedia.enabled = false;
    }
  })).antimedia;
  await message.reply(`Antimedia ${setting.enabled ? "aktif" : "nonaktif"}. Jenis: ${setting.types.join(", ") || "kosong"}.`);
};
