import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "groupinfo",
  active: true,
  aliases: ["infogrup"],
  description: "Tampilkan informasi grup saat ini.",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "groupinfo" && command?.name !== "infogrup") return;

  if (!message.isGroup) {
    await message.reply("Command ini hanya dapat dipakai di grup.");
    return;
  }

  const metadata = await message.getGroupMetadata();
  if (!metadata) {
    await message.reply("Gagal mengambil data grup.");
    return;
  }

  const admins = metadata.participants.filter((participant) => participant.admin);
  const created = metadata.creation
    ? new Date(metadata.creation * 1000).toLocaleDateString("id-ID", {
        dateStyle: "long",
        timeZone: "Asia/Jakarta",
      })
    : "-";

  await message.reply(
    [
      `*${metadata.subject}*`,
      `Anggota: ${metadata.participants.length}`,
      `Admin: ${admins.length}`,
      `Dibuat: ${created}`,
      ...(metadata.desc ? ["", "*Deskripsi*", metadata.desc] : []),
    ].join("\n"),
  );
};
