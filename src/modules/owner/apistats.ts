import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "apistats",
  active: true,
  ownerOnly: true,
  description: "Lihat penggunaan, kesalahan, dan latensi layanan API.",
  usage: ".apistats",
};

export const onMessage: MessageModule = async ({ message }) => {
  const usage = getAnalytics().apiUsage();
  await message.reply(
    usage.length
      ? [
          "*Statistik API*",
          ...usage.map(
            ({ service, calls, errors, avgMs }) =>
              `${service}: ${calls} panggilan, ${errors} gagal, rata-rata ${avgMs} ms`,
          ),
        ].join("\n")
      : "Belum ada penggunaan API yang tercatat.",
  );
};
