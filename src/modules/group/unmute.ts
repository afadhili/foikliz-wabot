import { requireGroupAdmin, updateGroupSettings } from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "unmute",
  active: true,
  description: "Izinkan kembali command anggota non-admin grup.",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "unmute") return;
  if (!(await requireGroupAdmin(message))) return;
  await updateGroupSettings(message.chatId, (config) => { config.mute = false; });
  await message.reply("Grup di-unmute: command anggota non-admin kembali tersedia.");
};
