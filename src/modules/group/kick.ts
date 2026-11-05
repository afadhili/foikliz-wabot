import type { MessageModule, ModuleMeta } from "../index";
import {
  hasAdminRole,
  isProtected,
  resolveTarget,
  updateParticipant,
  withGroupAccess,
} from "./management";

export const meta: ModuleMeta = {
  name: "kick",
  active: true,
  description: "Keluarkan anggota grup (khusus admin).",
  usage: "@anggota / reply / nomor",
};

export const onMessage: MessageModule = async (context) => {
  const command = context.message.command();
  if (command?.name !== meta.name) return;
  await withGroupAccess(context, async (access) => {
    const target = await resolveTarget(
      access,
      command.rest,
      false,
      `${command.prefix}kick ${meta.usage}`,
    );
    if (!target) return;
    if (
      (await isProtected(access, target.ids)) ||
      hasAdminRole(target.participant!)
    ) {
      await access.message.reply(
        "Tidak dapat mengeluarkan pemilik grup, bot, atau admin.",
      );
      return;
    }
    await updateParticipant(
      access,
      target.jid,
      "remove",
      "Anggota berhasil dikeluarkan.",
    );
  });
};
