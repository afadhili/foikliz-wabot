import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "status",
  active: true,
  ownerOnly: true,
  category: "owner",
  description: "Tampilkan status runtime dan penggunaan memori bot.",
};

function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [
    days ? `${days}h` : "",
    hours ? `${hours}j` : "",
    minutes ? `${minutes}m` : "",
    `${remainingSeconds}d`,
  ].filter(Boolean);

  return parts.join(" ");
}

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "status") return;

  const memory = process.memoryUsage();
  const toMiB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  const runtime =
    typeof Bun !== "undefined"
      ? `Bun ${Bun.version}`
      : `Node.js ${process.version}`;

  await message.reply(
    [
      "*Status bot*",
      `Uptime: ${formatDuration(process.uptime())}`,
      `Runtime: ${runtime}`,
      `Memori RSS: ${toMiB(memory.rss)} MiB`,
      `Heap: ${toMiB(memory.heapUsed)} / ${toMiB(memory.heapTotal)} MiB`,
    ].join("\n"),
  );
};
