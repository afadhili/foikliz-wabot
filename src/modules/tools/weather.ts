import type { MessageModule, ModuleMeta } from "../index";
import { cachedApi, monitorApiCall } from "../../analytics/runtime";

export const meta: ModuleMeta = {
  name: "weather",
  active: true,
  aliases: ["cuaca"],
  description: "Cek cuaca saat ini dan prakiraan 3 hari (sumber: wttr.in).",
  usage: "nama kota",
};

interface Value {
  value: string;
}

interface WttrResponse {
  current_condition?: Array<{
    temp_C: string;
    FeelsLikeC: string;
    humidity: string;
    windspeedKmph: string;
    precipMM: string;
    weatherDesc: Value[];
  }>;
  nearest_area?: Array<{ areaName: Value[]; country: Value[] }>;
  weather?: Array<{
    date: string;
    maxtempC: string;
    mintempC: string;
    hourly?: Array<{ chanceofrain?: string; weatherDesc: Value[] }>;
  }>;
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "weather" && command?.name !== "cuaca") return;

  const city = command.rest.trim();
  if (!city) {
    await message.reply(`Format: ${command.prefix}weather ${meta.usage}`);
    return;
  }

  await message.react("⏳");
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const data = await cachedApi(url, 10 * 60_000, () =>
      monitorApiCall("wttr", async () => {
        const response = await fetch(url, {
          headers: { "User-Agent": "FoiklizWabot/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          throw new Error(`Layanan cuaca merespons HTTP ${response.status}.`);
        }
        return (await response.json()) as WttrResponse;
      }),
    );
    const current = data.current_condition?.[0];
    if (!current) {
      await message.reply(`Lokasi "${city}" tidak ditemukan.`);
      await message.react("❌");
      return;
    }

    const area = data.nearest_area?.[0];
    const place = [area?.areaName[0]?.value, area?.country[0]?.value]
      .filter(Boolean)
      .join(", ");
    const forecast = (data.weather ?? []).map((day) => {
      const desc = day.hourly?.[4]?.weatherDesc[0]?.value ?? "-";
      return `> ${day.date}: ${day.mintempC}-${day.maxtempC}°C, ${desc}`;
    });

    await message.reply(
      [
        `*Cuaca ${place || city}*`,
        `${current.weatherDesc[0]?.value ?? "-"}, ${current.temp_C}°C (terasa ${current.FeelsLikeC}°C)`,
        `Kelembapan: ${current.humidity}%`,
        `Angin: ${current.windspeedKmph} km/jam`,
        `Curah hujan: ${current.precipMM} mm`,
        ...(forecast.length ? ["", "*Prakiraan*", ...forecast] : []),
      ].join("\n"),
    );
    await message.react("✅");
  } catch (error) {
    await message.reply(
      `Gagal mengambil cuaca: ${error instanceof Error ? error.message : String(error)}`,
    );
    await message.react("❌");
  }
};
