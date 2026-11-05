import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "activity",
  active: true,
  ownerOnly: true,
  description: "Lihat jenis aktivitas terbaru tanpa menampilkan identitas pengguna.",
  usage: ".activity",
};

export const onMessage: MessageModule = async ({ message }) => {
  const activity = getAnalytics().recentActivity(10);
  await message.reply(
    activity.length
      ? [
          "*Aktivitas terbaru*",
          ...activity.map(({ kind, createdAt }) => `${createdAt} | ${kind}`),
        ].join("\n")
      : "Belum ada aktivitas yang tercatat.",
  );
};
