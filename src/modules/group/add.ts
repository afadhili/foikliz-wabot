import type { MessageModule, ModuleMeta } from "../index";
import {
  isProtected,
  resolveTarget,
  updateParticipant,
  withGroupAccess,
} from "./management";

export const meta: ModuleMeta = {
  name: "add",
  active: true,
  description: "Tambahkan nomor ke grup (khusus admin).",
  usage: "@anggota / reply / nomor telepon",
};

export const onMessage: MessageModule = async (context) => {
  const command = context.message.command();
  if (command?.name !== meta.name) return;
  await withGroupAccess(context, async (access) => {
    const number = command.rest.trim();
    const explicitNumber = /^\+?\d{6,15}$/.test(number);
    if (
      !explicitNumber &&
      !access.message.mentions.length &&
      !access.message.quoted?.sender
    ) {
      await access.message.reply(`Format: ${command.prefix}add ${meta.usage}`);
      return;
    }
    const target = await resolveTarget(
      access,
      number,
      true,
      `${command.prefix}add ${meta.usage}`,
      explicitNumber,
    );
    if (!target) return;
    if (target.participant || (await isProtected(access, target.ids))) {
      await access.message.reply(
        "Target sudah menjadi anggota atau merupakan identitas terlindungi.",
      );
      return;
    }
    await updateParticipant(
      access,
      target.jid,
      "add",
      "Anggota berhasil ditambahkan.",
    );
  });
};
