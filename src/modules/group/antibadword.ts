import {
  getGroupSettings,
  normalizeBadWord,
  requireGroupAdmin,
  updateGroupSettings,
} from "../../group-moderation";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "antibadword",
  active: true,
  description: "Atur filter kata terlarang dengan kecocokan kata utuh.",
  usage: "add|remove|list|on|off [kata1 kata2 ...]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "antibadword") return;
  if (!(await requireGroupAdmin(message))) return;
  const [action, ...raw] = command.args;
  const inputs = raw.flatMap((part) => part.split(",")).filter(Boolean);
  const words = inputs.map(normalizeBadWord);
  if (
    !action ||
    !["add", "remove", "list", "on", "off"].includes(action) ||
    ((action === "list" || action === "off") && raw.length) ||
    ((action === "add" || action === "remove") && !words.length) ||
    words.some((word) => !word)
  ) {
    await message.reply(
      `Penggunaan: ${command.prefix}antibadword ${meta.usage}`,
    );
    return;
  }
  if (action === "list") {
    const setting = (await getGroupSettings(message.chatId)).antibadword;
    await message.reply(
      `Antibadword ${setting.enabled ? "aktif" : "nonaktif"}. Kata: ${setting.words.join(", ") || "kosong"}.`,
    );
    return;
  }
  const setting = (
    await updateGroupSettings(message.chatId, (config) => {
      if (action === "on" || action === "off")
        config.antibadword.enabled = action === "on";
      if (action === "remove")
        config.antibadword.words = config.antibadword.words.filter(
          (word) => !words.includes(word),
        );
      else if (words.length)
        config.antibadword.words = [
          ...new Set([...config.antibadword.words, ...(words as string[])]),
        ];
    })
  ).antibadword;
  await message.reply(
    `Antibadword ${setting.enabled ? "aktif" : "nonaktif"}. Kata: ${setting.words.join(", ") || "kosong"}.`,
  );
};
