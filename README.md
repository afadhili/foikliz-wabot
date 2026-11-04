# Foikliz Wabot

WhatsApp bot starter menggunakan Bun dan Baileys. Mendukung login lewat QR code atau pairing code.

## Persiapan

```sh
bun install
cp .env.example .env
```

Edit `.env` untuk memilih metode autentikasi dan prefix command. Atur `OWNER_NUMBER` ke nomor WhatsApp owner dalam format internasional hanya angka (contoh: `OWNER_NUMBER=6281234567890`); beberapa owner dapat dipisahkan koma. Command berlabel owner hanya dapat dijalankan owner dan hanya ditampilkan di `.help` yang diminta owner. `COMMAND_PREFIXES` menerima beberapa prefix yang dipisahkan koma, misalnya `.,!` (default: `.`). Baileys menggunakan versi `7.0.0-rc14` (release candidate).

## Login dengan QR

```sh
bun run start
```

Mode default adalah `qr`. Scan QR dari WhatsApp melalui **Perangkat tertaut**.

## Login dengan pairing code

Atur `.env` dengan nomor berkode negara (8-15 digit, tanpa `+`, spasi, atau angka `0` di awal):

```dotenv
AUTH_METHOD=pairing
PHONE_NUMBER=6281234567890
```

Lalu jalankan `bun run start`. Kode diminta setelah koneksi awal dimulai. Buka WhatsApp **Perangkat tertaut > Tautkan dengan nomor telepon**, lalu segera masukkan kode yang tampil di terminal. Jika akun sudah pernah terhubung dan kredensial tersimpan di `auth_info/`, bot akan memakai sesi tersebut dan tidak meminta pairing code baru. Untuk menautkan akun berbeda, hentikan bot dan hapus sesi lama terlebih dahulu.

Sesi tersimpan di `auth_info/`; jangan bagikan atau commit direktori tersebut. Untuk mengganti akun, hentikan proses, hapus `auth_info/`, lalu autentikasi ulang.

## Message modules

Semua file `.ts` atau `.js` di `src/modules/` dan subfoldernya dimuat otomatis saat startup. Setiap module mengekspor callback `onMessage` atau `default`, dan metadata `meta` agar dapat ditampilkan oleh `.help`. Metadata wajib memiliki `active: true` atau `active: false`; module nonaktif tidak didaftarkan, callback-nya tidak dijalankan, dan tidak muncul di `.help`. Kategori `.help` diambil otomatis dari folder relatif module; misalnya `src/modules/downloader/youtube.ts` masuk kategori `downloader`, sedangkan module di root `src/modules/` masuk `umum`. Module dapat menimpa kategori dengan `category` di metadata; gunakan `category: "owner"` bersama `ownerOnly: true` untuk fitur owner-only. `ownerOnly` ditegakkan oleh dispatcher dan metadata fiturnya disaring dari `.help` untuk non-owner.

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

Callback menerima `message` hasil parser. Error dari satu module dicatat dan tidak menghentikan callback module lainnya.

Module `sticker.ts` merespons perintah sticker bersama gambar atau sebagai reply ke gambar. Media diunduh melalui parser, di-resize maksimal 512×512 dan dikompresi ke WebP menggunakan FFmpeg. `toimg` mengubah sticker menjadi PNG. `.removebg` menghapus background foto dan mengirim PNG transparan tanpa resize output sehingga dimensi input tetap dipertahankan. Model `isnet` dijalankan lokal melalui `@imgly/background-removal`; file ONNX/WASM diunduh dari IMG.LY saat pertama kali dipakai, jadi koneksi internet diperlukan. Perhatikan bahwa package ini berlisensi AGPL-3.0; pastikan lisensinya sesuai kebutuhan distribusi project.

## Downloader

Module downloader berada di `src/modules/downloader/` dan menggunakan executable `yt-dlp`. Install `yt-dlp`, `ffmpeg`, `git`, `cmake`, dan compiler C++ di mesin yang menjalankan bot. `ffmpeg` diperlukan untuk ekstrak MP3, menggabungkan stream video/audio, konversi gambar/sticker, serta menyiapkan audio transkripsi. Jika binary tidak ada di `PATH`, atur `YTDLP_PATH`, `FFMPEG_PATH`, atau `WHISPER_CPP_PATH` di `.env`.

Semua URL harus publik dan berasal dari domain platform terkait. Batas ukuran hasil adalah 64 MB dan waktu download maksimal 3 menit. Setup whisper.cpp lokal (build executable dan download model multilingual `base`, sekitar 142 MiB):

```sh
bun run setup:whisper
```

Binary dan model disimpan di `.tools/whisper.cpp/` (diabaikan Git). Untuk mengganti lokasi executable/model, atur `WHISPER_CPP_PATH` atau `WHISPER_MODEL_PATH` di `.env`; jumlah thread dapat diatur melalui `WHISPER_THREADS`.

```text
.tiktok URL [mp4|mp3]
.youtube URL [mp4|mp3] [360|480|720|1080]
.instagram URL
.transcribe URL
.lyrics judul lagu - nama artis
```

Resolusi YouTube default adalah 720p. Instagram mengirim hasil sebagai MP4. Transkripsi video berjalan secara lokal dengan whisper.cpp tanpa API transkripsi eksternal dan mengirim hasil sebagai teks. `.lyrics judul lagu - nama artis` mencari lirik lewat LRCLIB dan fallback ke NetEase; alias command-nya `.lirik`.

## Docker Compose

Compose hanya menjalankan bot. Image bot menyertakan FFmpeg, yt-dlp, whisper.cpp, dan model transkripsi `base`; build pertama memerlukan koneksi internet dan dapat memakan waktu.

```sh
cp .env.example .env
# Atur AUTH_METHOD=pairing dan PHONE_NUMBER=628... di .env bila memakai pairing
# Pastikan bot tidak sedang berjalan di host atau container lain dengan auth_info yang sama

docker compose up --build -d
docker compose logs -f bot
```

QR login muncul di log service `bot`. Sesi WhatsApp dan file unduhan disimpan pada named volumes. `docker compose down` mempertahankan data; `docker compose down -v` menghapus semua volume termasuk sesi.

## Pengembangan

```sh
bun run dev
bun run typecheck
```
