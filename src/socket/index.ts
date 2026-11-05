import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { rm } from "node:fs/promises";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { parsedMessage } from "../parser";
import { getAnalytics } from "../analytics/store";
import { markPrimarySocket, startManagedBots } from "../bot-manager";
import {
  allowCommand,
  enqueueCommand,
  shouldNotifyRateLimit,
} from "../analytics/runtime";
import { handleParticipantsUpdate, moderateMessage } from "../group-moderation";
import {
  dispatchMessage,
  isOwnerSender,
  loadMessageModules,
  resolveSenderJid,
  type LoadedMessageModule,
} from "../modules";

export interface WhatsAppSocketOptions {
  authMethod?: "qr" | "pairing";
  phoneNumber?: string;
  authDirectory?: string;
  managed?: boolean;
  onPairingCode?: (code: string) => Promise<void> | void;
}

export class WhatsAppSocket {
  private readonly authMethod: "qr" | "pairing";
  private readonly phoneNumber?: string;
  private readonly authDirectory: string;
  private readonly logger = pino({ level: "silent" });
  private readonly managed: boolean;
  private readonly onPairingCode?: (code: string) => Promise<void> | void;
  private stopped = false;
  private activeSocket?: ReturnType<typeof makeWASocket>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pairingCodeRequested = false;

  private messageModules: LoadedMessageModule[] = [];
  private state!: Awaited<ReturnType<typeof useMultiFileAuthState>>["state"];
  private saveCreds!: Awaited<
    ReturnType<typeof useMultiFileAuthState>
  >["saveCreds"];

  constructor(options: WhatsAppSocketOptions = {}) {
    this.authMethod = options.authMethod ?? "qr";
    this.phoneNumber = options.phoneNumber?.replace(/\D/g, "");
    this.authDirectory = options.authDirectory ?? "./auth_info";
    this.managed = options.managed ?? false;
    this.onPairingCode = options.onPairingCode;

    if (
      this.authMethod === "pairing" &&
      (!this.phoneNumber ||
        !/^\d{8,15}$/.test(this.phoneNumber) ||
        this.phoneNumber.startsWith("0"))
    ) {
      throw new Error(
        "PHONE_NUMBER wajib diisi dengan kode negara, 8-15 digit, tanpa +, spasi, atau angka 0 di awal (contoh: 6281234567890).",
      );
    }
  }

  private async loadAuth() {
    const auth = await useMultiFileAuthState(this.authDirectory);
    this.state = auth.state;
    this.saveCreds = auth.saveCreds;
  }

  async start() {
    this.stopped = false;
    await this.loadAuth();
    this.messageModules = await loadMessageModules();
    console.log(`${this.messageModules.length} message module(s) dimuat.`);
    await this.connect();
  }

  private async connect() {
    const { version } = await fetchLatestBaileysVersion();

    if (this.stopped) return;
    const socket = makeWASocket({
      version,
      auth: this.state,
      logger: this.logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
    });

    this.activeSocket = socket;
    if (!this.managed) markPrimarySocket(socket);
    socket.ev.on("creds.update", this.saveCreds);

    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr && this.authMethod === "qr") {
        console.log("Scan QR berikut melalui WhatsApp > Perangkat tertaut:");
        qrcode.generate(qr, { small: true });
      }

      if (
        qr &&
        this.authMethod === "pairing" &&
        !this.state.creds.registered &&
        !this.pairingCodeRequested &&
        !this.stopped
      ) {
        this.pairingCodeRequested = true;
        void (async () => {
          try {
            const code = await socket.requestPairingCode(this.phoneNumber!);
            if (this.stopped || socket !== this.activeSocket) return;
            if (this.onPairingCode) await this.onPairingCode(code);
            else console.log(`Kode pairing WhatsApp: ${code}`);
            console.log(
              "Masukkan segera di WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.",
            );
          } catch (error) {
            console.error("Gagal meminta pairing code:", error);
          }
        })();
      }

      if (connection === "open") {
        console.log("WhatsApp terhubung.");
        if (!this.managed) void startManagedBots(socket).catch(console.error);
      }
      if (connection !== "close") return;

      const error = lastDisconnect?.error as
        { output?: { statusCode?: number }; message?: string } | undefined;
      const statusCode = error?.output?.statusCode;
      console.error(
        `Koneksi ditutup (status ${statusCode ?? "tidak diketahui"}${error?.message ? `: ${error.message}` : ""}).`,
      );

      if (this.stopped) return;
      if (statusCode === DisconnectReason.loggedOut) {
        if (this.managed) return;
        console.error(
          "Sesi logout. Menghapus auth dan memulai ulang autentikasi...",
        );
        void (async () => {
          try {
            await rm(this.authDirectory, { recursive: true, force: true });
            await this.loadAuth();
            await this.connect();
          } catch (resetError) {
            console.error("Gagal mereset sesi:", resetError);
            process.exitCode = 1;
          }
        })();
        return;
      }

      console.log("Mencoba menghubungkan kembali dalam 2 detik...");
      this.reconnectTimer = setTimeout(() => void this.connect(), 2_000);
    });

    socket.ev.on("group-participants.update", (update) => {
      try {
        getAnalytics().recordActivity(`group.${update.action}`, update.id);
      } catch (error) {
        console.error("Gagal mencatat aktivitas grup:", error);
      }
      void handleParticipantsUpdate(socket, {
        id: update.id,
        action: update.action,
        participants: update.participants.map((participant) => participant.id),
      }).catch((error) => console.error("Gagal mengirim salam grup:", error));
    });

    socket.ev.on("messages.upsert", async ({ type, messages }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        const parsed = parsedMessage(socket, message);
        if (!parsed || parsed.fromMe) continue;
        await parsed.read();

        if (parsed.quoted) console.log(`\n ↶ reply ke: ${parsed.quoted.text}`);
        console.log(
          `${!parsed.quoted ? "\n" : ""}[${parsed.isGroup ? "GROUP" : "DM"}] ${parsed.pushName} (${await resolveSenderJid(parsed.sender, socket)}): ${parsed.text}`,
        );

        void (async () => {
          try {
            const sender = await resolveSenderJid(parsed.sender, socket);
            if (!sender) return;
            if (parsed.id) {
              try {
                getAnalytics().recordMessage({
                  id: parsed.id,
                  chatId: parsed.chatId,
                  sender,
                  pushName: parsed.pushName,
                  isGroup: parsed.isGroup,
                  type: parsed.type,
                  timestamp:
                    parsed.timestamp > 0 ? parsed.timestamp * 1000 : Date.now(),
                });
              } catch (error) {
                console.error("Gagal mencatat statistik pesan:", error);
              }
            }
            if (await moderateMessage(socket, parsed)) return;
            const command = parsed.command();
            if (!command) return;
            const owner = await isOwnerSender(parsed.sender, socket);
            if (!owner && !allowCommand(sender)) {
              try {
                getAnalytics().recordCommand({
                  name: command.name,
                  sender,
                  chatId: parsed.chatId,
                  status: "limited",
                  durationMs: 0,
                });
              } catch (error) {
                console.error("Gagal mencatat rate limit:", error);
              }
              if (shouldNotifyRateLimit(sender)) {
                await parsed.reply(
                  "Terlalu banyak command. Coba lagi dalam satu menit.",
                );
              }
              return;
            }
            const run = () =>
              dispatchMessage(this.messageModules, {
                message: parsed,
                socket,
              });
            if (owner && command.name === "queue") await run();
            else await enqueueCommand(run);
          } catch (error) {
            console.error("Gagal memproses pesan:", error);
            if (
              error instanceof Error &&
              error.message === "Antrean command penuh."
            ) {
              await parsed
                .reply("Bot sedang sibuk. Coba lagi sebentar.")
                .catch(console.error);
            }
            try {
              getAnalytics().recordError("message.processing", error);
            } catch (loggingError) {
              console.error("Gagal mencatat error pesan:", loggingError);
            }
          }
        })();
      }
    });
  }

  async stop(options: { logout?: boolean } = {}) {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.activeSocket;
    this.activeSocket = undefined;
    if (!socket) return;
    try {
      if (options.logout) await socket.logout();
      else socket.end(new Error("Managed bot stopped"));
    } catch (error) {
      console.warn("Gagal menutup sesi bot:", error);
    }
  }
}
