# Foikliz Wabot

WhatsApp bot starter menggunakan Bun dan Baileys. Mendukung login lewat QR code atau pairing code.

## Persiapan

```sh
bun install
cp .env.example .env
```

Edit `.env` untuk memilih metode autentikasi dan prefix command. `COMMAND_PREFIXES` menerima beberapa prefix yang dipisahkan koma, misalnya `.,!` (default: `.`). Baileys menggunakan versi terbaru yang tersedia saat inisialisasi (`7.0.0-rc14`, release candidate).

## Login dengan QR

```sh
bun run start
```

Mode default adalah `qr`. Scan QR dari WhatsApp melalui **Perangkat tertaut**.

## Login dengan pairing code

Masukkan nomor dengan kode negara, hanya angka (contoh Indonesia: `6281234567890`):

Atur `.env` seperti berikut:

```dotenv
AUTH_METHOD=pairing
PHONE_NUMBER=6281234567890
```

Lalu jalankan:

```sh
bun run start
```

Buka WhatsApp **Perangkat tertaut > Tautkan dengan nomor telepon**, lalu masukkan kode yang tampil di terminal.

Sesi tersimpan di `auth_info/`; jangan bagikan atau commit direktori tersebut. Untuk mengganti akun, hentikan proses, hapus `auth_info/`, lalu autentikasi ulang.

## Message modules

Semua file `.ts` atau `.js` di `src/modules/` dan subfoldernya dimuat otomatis saat startup (misalnya `src/modules/img/sticker.ts`). Setiap module mengekspor callback `onMessage` atau `default`, dan metadata `meta` agar dapat ditampilkan oleh `.help`. Callback berjalan untuk setiap pesan masuk yang berhasil diparse.

```ts
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "hai",
  description: "Menyapa pengguna.",
  aliases: ["salam"],
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "hai") return;
  await message.reply("Halo!");
};
```

Callback menerima `message` hasil parser dan `socket` Baileys terbatas pada `sendMessage`. Error dari satu module dicatat dan tidak menghentikan callback module lainnya.

Module `sticker.ts` merespons `.sticker` yang dikirim bersama gambar, atau saat membalas gambar. Media diunduh melalui parser, di-resize maksimal 512×512 dan dikompresi ke WebP menggunakan FFmpeg, lalu dikirim sebagai sticker. Video belum didukung oleh konversi ini.

## Downloader

Module downloader berada di `src/modules/downloader/` dan menggunakan executable `yt-dlp`. Install `yt-dlp`, `ffmpeg`, `git`, `cmake`, dan compiler C++ di mesin yang menjalankan bot. `ffmpeg` diperlukan untuk ekstrak MP3, menggabungkan stream video/audio, konversi gambar/sticker, serta menyiapkan audio transkripsi. Jika binary tidak ada di `PATH`, atur `YTDLP_PATH`, `FFMPEG_PATH`, atau `WHISPER_CPP_PATH` di `.env` sesuai executable yang dipakai.

Semua URL harus publik dan berasal dari domain platform terkait. Batas ukuran hasil adalah 64 MB dan waktu download maksimal 3 menit. Setup whisper.cpp lokal (build executable dan download model base, sekitar 142 MiB):

```sh
bun run setup:whisper
```

Binary dan model disimpan di `.tools/whisper.cpp/` (diabaikan Git). Untuk mengganti lokasi executable/model, atur `WHISPER_CPP_PATH` atau `WHISPER_MODEL_PATH` di `.env`; jumlah thread dapat diatur melalui `WHISPER_THREADS`.

```text
.tiktok URL [mp4|mp3]
.youtube URL [mp4|mp3] [360|480|720|1080]
.instagram URL
```

Resolusi YouTube default adalah 720p. Instagram mengirim hasil sebagai MP4. Perintah memakai prefix dari `COMMAND_PREFIXES`.

## AI assistant (Ollama)

Jalankan Ollama lokal dan pull model default:

```sh
ollama pull gemma3:4b
ollama serve
```

Atur `OLLAMA_BASE_URL` dan `OLLAMA_MODEL` di `.env`. Di chat WhatsApp, gunakan `.ai on` untuk mengaktifkan AI bagi pengirim tersebut di chat itu, `.ai off` untuk kembali ke perilaku command biasa, dan `.ai status` untuk mengecek status pribadi. Di grup, status dan konteks tiap pengirim dipisahkan. Assistant menyertakan maksimal 15 pesan percakapan sebelumnya milik pengirim tersebut sebagai memory; memory ini disimpan di RAM dan ter-reset saat bot restart. Saat aktif, pesan natural-language dikirim ke Ollama untuk memilih jawaban atau satu tool yang diizinkan. Daftar tool, deskripsi, parameter, dan syarat dibuat otomatis dari `meta.ai` module; eksekusi diarahkan ke `executeAI` milik module tersebut. Pesan yang diawali prefix command tetap diproses oleh module command biasa.

Untuk menambahkan tool baru, isi `meta.ai` dan ekspor `executeAI` di module. Module tanpa keduanya tidak akan ditawarkan ke AI:

```ts
export const meta: ModuleMeta = {
  name: "example",
  description: "Contoh command.",
  ai: {
    description: "Jelaskan kemampuan tool ke AI.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Informasi yang dibutuhkan." },
      },
      required: ["query"],
    },
    requirements: ["Syarat tambahan untuk menjalankan tool."],
  },
};

export async function executeAI({ message }, args) {
  await message.reply(`Memproses: ${args.query}`);
  return "Selesai.";
}
```

Model resmi Ollama Gemma 3 saat ini tidak menyediakan tag `gemma3:8b` (ukuran yang tersedia mencakup 4b dan 12b). Karena itu default diset ke `gemma3:4b`; ubah `OLLAMA_MODEL` jika Anda memiliki model/tag 8B khusus. Ollama harus berjalan pada mesin yang dapat diakses bot. AI hanya dapat memilih tool allowlist; URL dan jenis media tetap divalidasi oleh aplikasi, dan tidak ada eksekusi shell bebas.

### Transkripsi video

Gunakan `transcribe URL` untuk membuat transkrip dari video publik YouTube, Instagram, atau TikTok. Transkripsi berjalan lokal dengan `whisper.cpp` model multilingual `base`; tidak memerlukan `OPENAI_API_KEY` dan audio tidak dikirim ke API transkripsi eksternal. Model base membutuhkan sekitar 142 MiB penyimpanan dan 388 MB RAM menurut dokumentasi whisper.cpp. Proses di CPU bisa lebih lambat daripada durasi video, tergantung perangkat.

## Pengembangan

```sh
bun run dev
bun run typecheck
```
