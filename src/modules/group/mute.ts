import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "mute",
  active: true,
  description: "Blokir eksekusi command dari anggota non-admin grup.",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "mute") return;
  if (!(await requireGroupAdmin(message))) return;
  await updateGroupSettings(message.chatId, (config) => { config.mute = true; });
  await message.reply("Grup di-mute: command anggota non-admin diblokir (pesan biasa tidak dihapus).");
};
