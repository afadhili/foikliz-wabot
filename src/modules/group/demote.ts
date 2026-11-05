import type { MessageModule, ModuleMeta } from "../index";
import {
  hasAdminRole,
  isProtected,
  isSameIdentity,
  resolveTarget,
  updateParticipant,
  withGroupAccess,
} from "./management";

export const meta: ModuleMeta = {
  name: "demote",
  active: true,
  description: "Turunkan admin menjadi anggota.",
  usage: "@admin / reply / nomor",
};

export const onMessage: MessageModule = async (context) => {
  const command = context.message.command();
  if (command?.name !== meta.name) return;
  await withGroupAccess(context, async (access) => {
    const target = await resolveTarget(
      access,
      command.rest,
      false,
      `${command.prefix}demote ${meta.usage}`,
    );
    if (!target) return;
    if (
      isSameIdentity(target.ids, access.sender) ||
      (await isProtected(access, target.ids)) ||
      target.participant?.admin === "superadmin" ||
      target.participant?.isSuperAdmin
    ) {
      await access.message.reply(
        "Tidak dapat menurunkan diri sendiri, bot, atau pemilik grup.",
      );
      return;
    }
    if (!hasAdminRole(target.participant!)) {
      await access.message.reply("Target bukan admin.");
      return;
    }
    await updateParticipant(
      access,
      target.jid,
      "demote",
      "Admin berhasil diturunkan.",
    );
  });
};
