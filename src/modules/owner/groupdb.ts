import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "groupdb",
  active: true,
  ownerOnly: true,
  description: "Lihat jumlah grup tersimpan tanpa membuka data pribadi.",
  usage: ".groupdb",
};

export const onMessage: MessageModule = async ({ message }) => {
  const { groups } = getAnalytics().summary();
  await message.reply(
    `*Basis data grup*\nJumlah grup: ${groups}\nDemi privasi, ID grup dan isi percakapan tidak ditampilkan.`,
  );
};
