import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "errors",
  active: true,
  ownerOnly: true,
  description: "Lihat kesalahan terbaru yang dicatat analitik.",
  usage: ".errors",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.isGroup) {
    await message.reply("Riwayat kesalahan hanya tersedia di chat pribadi.");
    return;
  }
  const errors = getAnalytics().recentErrors(10);
  await message.reply(
    errors.length
      ? [
          "*Kesalahan terbaru*",
          ...errors.map(({ scope, message: detail, createdAt }) =>
            `${createdAt} | ${scope}: ${detail}`,
          ),
        ].join("\n")
      : "Belum ada kesalahan yang tercatat.",
  );
};
