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
  name: "promote",
  active: true,
  description: "Jadikan anggota admin grup.",
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
      `${command.prefix}promote ${meta.usage}`,
    );
    if (!target) return;
    if (
      isSameIdentity(target.ids, access.sender) ||
      (await isProtected(access, target.ids))
    ) {
      await access.message.reply(
        "Tidak dapat mengubah admin diri sendiri, bot, atau pemilik grup.",
      );
      return;
    }
    if (hasAdminRole(target.participant!)) {
      await access.message.reply("Target sudah menjadi admin.");
      return;
    }
    await updateParticipant(
      access,
      target.jid,
      "promote",
      "Anggota berhasil dijadikan admin.",
    );
  });
};
