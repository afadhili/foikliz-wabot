import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "ping",
  active: true,
  ownerOnly: true,
  category: "owner",
  description: "Cek respons bot.",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "ping") return;
  await message.reply("pong!");
};
