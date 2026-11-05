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

Sesi utama tersimpan di `auth_info/`; sesi tambahan dari `.newbot` disimpan terpisah di `auth/<nomor>/` dan dicatat di `data/managed-bots.json`. Pairing code hanya dikirim ke chat pribadi owner yang memanggil command. `.rmbot <nomor>` logout lalu menghapus sesi managed tersebut; tindakan ini tidak menghapus sesi utama dan tidak dapat dibatalkan. Kedua folder auth berisi kredensial sensitif: jangan bagikan atau commit.

## Message modules

Semua file `.ts` atau `.js` di `src/modules/` dan subfoldernya dimuat otomatis saat startup. Setiap module mengekspor callback `onMessage` atau `default`, dan metadata `meta` agar dapat ditampilkan oleh `.help`. Metadata wajib memiliki `active: true` atau `active: false`; module nonaktif tidak didaftarkan, callback-nya tidak dijalankan, dan tidak muncul di `.help`. Kategori `.help` diambil otomatis dari folder relatif module; misalnya `src/modules/downloader/youtube.ts` masuk kategori `downloader`, sedangkan module di root `src/modules/` masuk `umum`. Module dapat menimpa kategori dengan `category` di metadata; gunakan `category: "owner"` bersama `ownerOnly: true` untuk fitur owner-only. `ownerOnly` ditegakkan oleh dispatcher dan metadata fiturnya disaring dari `.help` untuk non-owner. Dispatcher hanya menjalankan satu module yang nama/alias-nya cocok dengan command; command lain tidak ikut memproses pesan yang sama.

Gunakan `.help` untuk **daftar kategori saja**, `.help image` (atau kategori lain) untuk daftar command dan deskripsinya dalam kategori, dan `.help removebg` untuk detail cara pakai serta alias command tersebut. Kategori `owner` dan detail perintahnya hanya tersedia untuk owner.

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

Module `brat.ts` membuat sticker bergaya brat (teks hitam huruf kecil dengan blur tipis). Gunakan `.brat teks` untuk latar putih (default) atau `.bratgreen teks` (alias `.bratijo`) untuk latar hijau; keduanya juga bisa dipakai sebagai reply pesan teks; ukuran font menyesuaikan panjang teks (maksimal 200 karakter) dan baris baru dipertahankan. Teks dirender oleh `sharp` memakai font sistem (Arial, Liberation Sans, atau DejaVu Sans); Docker image sudah menyertakan `fonts-liberation` dan `fonts-noto-color-emoji`, sedangkan di host pastikan minimal satu font sans-serif terpasang.

Module `sticker.ts` merespons `.sticker` (alias `.s`) bersama gambar/video atau sebagai reply ke gambar/video. Gambar dikonversi menjadi sticker statis; video dikonversi menjadi sticker WebP animasi (maksimal 6 detik, 512×512, tanpa audio) dengan padding transparan, bukan putih. Gunakan `.sticker crop` (atau `.s crop`) untuk crop tengah tepat 512×512 tanpa resize; sumber gambar/video harus minimal 512×512 piksel. Video maksimal 32 MB dan hasil sticker animasi maksimal 1 MB; bila terlalu besar, kualitas/fps diturunkan (pada mode crop, dimensinya tetap 512×512). Media diunduh melalui parser dan dikonversi memakai FFmpeg. `toimg` mengubah sticker menjadi PNG. `.removebg` menghapus background foto dan mengirim PNG transparan tanpa resize output sehingga dimensi input tetap dipertahankan. Model `isnet` dijalankan lokal melalui `@imgly/background-removal`; file ONNX/WASM diunduh dari IMG.LY saat pertama kali dipakai, jadi koneksi internet diperlukan. Perhatikan bahwa package ini berlisensi AGPL-3.0; pastikan lisensinya sesuai kebutuhan distribusi project.

## Downloader

Module downloader berada di `src/modules/downloader/` dan menggunakan executable `yt-dlp`. Install `yt-dlp`, `ffmpeg`, `git`, `cmake`, dan compiler C++ di mesin yang menjalankan bot. `ffmpeg` diperlukan untuk ekstrak MP3, menggabungkan stream video/audio, konversi gambar/sticker, serta menyiapkan audio transkripsi. `ffprobe` (biasanya tersedia bersama FFmpeg) diperlukan untuk memeriksa dimensi saat memakai opsi `crop`. Jika binary tidak ada di `PATH`, atur `YTDLP_PATH`, `FFMPEG_PATH`, atau `WHISPER_CPP_PATH` di `.env`.

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

## Group management

Semua command berikut khusus **admin grup**, kecuali `.groupinfo` (semua anggota). Bot juga harus menjadi admin untuk tindakan yang mengubah grup dan menghapus pesan. `.kick`, `.add`, `.promote`, `.demote` menerima satu target lewat mention, reply pesan, atau nomor internasional (contoh `6281234567890`); `.add` bergantung pada pengaturan privasi undangan akun target.

```text
.kick @anggota       .add 6281234567890
.promote @anggota    .demote @admin
.tagall [pesan]      .hidetag pesan
.groupinfo           .grouplink
.revoke              .setname Nama Grup
.setdesc Deskripsi    .open / .close
```

`.revoke` mengganti tautan undangan lama. `.open` mengizinkan seluruh anggota mengirim pesan; `.close` membatasi pengiriman hanya untuk admin. `.tagall` (alias `.everyone`) dan `.hidetag` (alias `.ht`) juga menerima teks dari pesan yang di-reply.

Pengaturan berikut disimpan per grup di `data/group-settings.json` dan default-nya **nonaktif**:

```text
.welcome on [template]        .welcome off
.goodbye on [template]        .goodbye off
.antispam on|off              # hapus pesan ke-8 dan berikutnya dalam 10 detik
.antilink on example.com      # blokir hanya domain yang disebut (termasuk subdomain)
.antilink off                 # nonaktifkan filter tanpa menghapus daftar domain
.antibadword add kata1 kata2  # tambah kata terlarang
.antibadword remove kata1     # hapus kata
.antibadword list             # tampilkan daftar dan status
.antibadword on|off           # aktifkan/nonaktifkan filter
.antisticker on|off           # hapus stiker non-admin
.antimedia on image,video     # hapus media sesuai jenis; pilihan: image,video,audio,document
.antimedia off [image,video]  # nonaktifkan seluruhnya atau hilangkan jenis tertentu
.mute / .unmute               # blokir/izinkan command anggota non-admin (bukan pesan biasa)
```

Template `.welcome` dan `.goodbye` mendukung `{user}` dan `{group}`, contoh `.welcome on Halo {user}, selamat datang di {group}!`. Pesan admin tidak terkena filter. Antispam hanya menyimpan hitungan jangka pendek di memori; filter lain tersimpan di disk. Bot tidak otomatis mengeluarkan anggota saat melanggar aturan; tanpa hak admin bot, pesan tidak bisa dihapus. Pada Docker Compose, data disimpan di volume `bot_data` (jangan gunakan `docker compose down -v` bila ingin mempertahankan pengaturan).

## Tools

```text
.calc ekspresi                     # kalkulator tanpa eval (alias: .hitung)
.weather nama kota                 # cuaca via wttr.in (alias: .cuaca)
.translate [kode bahasa] teks      # terjemahan via MyMemory, default id (alias: .tr)
```

Contoh: `.calc (12 + 8) * 3 / 4`, `.translate en selamat pagi`. `.translate` juga dapat dipakai sebagai reply ke pesan teks. MyMemory membatasi 450 karakter per permintaan dan menerapkan kuota harian per IP.

## Database & Analytics

Bot menggunakan SQLite bawaan Bun (`data/bot.sqlite`) tanpa layanan database eksternal. Bot menyimpan JID pengguna, nama tampilan, ID grup, tipe/waktu/ID pesan untuk deduplikasi, agregat command, dan log aktivitas/error terbatas. **Isi teks percakapan, media, dan isi request API tidak disimpan di database.** DAU dihitung berdasarkan tanggal UTC. Pencatatan dimulai saat fitur ini diaktifkan, bukan menghitung ulang riwayat chat lama.

Command berikut hanya muncul di `.help owner` dan dapat dijalankan oleh nomor `OWNER_NUMBER`:

```text
.newbot <nomor>     # mulai sesi terpisah dan kirim pairing code ke owner
.rmbot <nomor>      # logout dan hapus sesi terkelola (tidak dapat dipulihkan)
.stats              # pengguna, grup, pesan, DAU, total command, command terpopuler
.msgstats           # pesan hari ini (UTC) dan jumlah per jenis media
.userdb / .groupdb  # jumlah record pengguna/grup, tanpa menampilkan identitas
.errors             # kategori error terbaru (hanya di chat pribadi)
.activity           # jenis aktivitas terakhir (tanpa identitas)
.apistats           # jumlah panggilan, gagal, rata-rata durasi per API
.cache              # statistik cache API   |  .cache clear CONFIRM
.queue              # antrean aktif/tertunda |  .queue clear CONFIRM
.dbbackup           # kirim dokumen SQLite ke chat pribadi owner
.dbrestore CONFIRM  # reply dokumen backup di chat pribadi owner untuk restore
```

Rate limit: **12 command/menit per pengirim non-owner**; maksimal **4 command aktif dan 100 tertunda**. `.queue clear CONFIRM` membatalkan pekerjaan yang belum dimulai saja. Cache respons LRCLIB/NetEase berlaku 6 jam dan cuaca wttr.in 10 menit (maksimal 100 entri); teks terjemahan **tidak di-cache**. `.apistats` menghitung permintaan yang benar-benar keluar ke LRCLIB, NetEase, wttr.in, dan MyMemory; cache hit tidak membuat panggilan API. Error disimpan berdasarkan kategori, tanpa teks exception yang mungkin mengandung data pribadi.

Backup/restore hanya mencakup **database analitik SQLite**, maksimal 32 MB. Berkas `data/group-settings.json` adalah pengaturan moderasi terpisah: cadangkan secara terpisah jika diperlukan. Restore mengganti seluruh data analitik saat ini, jadi simpan backup terkini sebelum menjalankannya. Data di `/app/data` dipersist oleh volume `bot_data`; `docker compose down -v` menghapusnya. Jika menggunakan `ANALYTICS_DB_PATH` atau `GROUP_SETTINGS_PATH`, gunakan lokasi yang dipersist di dalam container.

## Docker Compose

Compose hanya menjalankan bot. Image bot menyertakan FFmpeg, yt-dlp, whisper.cpp, model transkripsi `base`, dan `assets/banner.png`; build pertama memerlukan koneksi internet dan dapat memakan waktu. Compose juga me-mount `./assets` ke `/app/assets` secara read-only supaya banner yang diganti di host langsung tersedia dalam container. Pastikan `assets/banner.png` ada. Jika mengatur `BANNER_PATH` di `.env`, gunakan **path dalam container** seperti `/app/assets/banner.png`, bukan path host.

```sh
cp .env.example .env
# Atur AUTH_METHOD=pairing dan PHONE_NUMBER=628... di .env bila memakai pairing
# Pastikan bot tidak sedang berjalan di host atau container lain dengan auth_info yang sama

docker compose up --build -d
docker compose logs -f bot
```

QR login maupun kode pairing muncul di log service `bot`. Sesi WhatsApp, file unduhan, dan pengaturan grup disimpan pada named volumes; sesi Docker berbeda dari `auth_info/` lokal. `docker compose down` mempertahankan data; `docker compose down -v` menghapus semua volume termasuk sesi. Setelah mengubah Dockerfile, jalankan ulang `docker compose up --build -d`. Jika thumbnail banner tidak muncul, cek `docker compose logs bot` untuk peringatan `Banner tidak ditemukan` atau `Gagal mengunggah thumbnail besar` dan pastikan `BOT_URL` adalah URL yang valid.

## Pengembangan

```sh
bun run dev
bun run typecheck
```
