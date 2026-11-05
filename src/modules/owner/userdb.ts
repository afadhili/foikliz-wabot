import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "userdb",
  active: true,
  ownerOnly: true,
  description: "Lihat jumlah pengguna tersimpan tanpa membuka data pribadi.",
  usage: ".userdb",
};

export const onMessage: MessageModule = async ({ message }) => {
  const { users } = getAnalytics().summary();
  await message.reply(
    `*Basis data pengguna*\nJumlah pengguna: ${users}\nDemi privasi, ID pengguna dan isi percakapan tidak ditampilkan.`,
  );
};
