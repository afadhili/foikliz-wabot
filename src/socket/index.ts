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
import {
  dispatchMessage,
  loadMessageModules,
  type LoadedMessageModule,
} from "../modules";

export interface WhatsAppSocketOptions {
  authMethod?: "qr" | "pairing";
  phoneNumber?: string;
  authDirectory?: string;
}

export class WhatsAppSocket {
  private readonly authMethod: "qr" | "pairing";
  private readonly phoneNumber?: string;
  private readonly authDirectory: string;
  private readonly logger = pino({ level: "silent" });

  private messageModules: LoadedMessageModule[] = [];
  private state!: Awaited<ReturnType<typeof useMultiFileAuthState>>["state"];
  private saveCreds!: Awaited<
    ReturnType<typeof useMultiFileAuthState>
  >["saveCreds"];

  constructor(options: WhatsAppSocketOptions = {}) {
    this.authMethod = options.authMethod ?? "qr";
    this.phoneNumber = options.phoneNumber?.replace(/\D/g, "");
    this.authDirectory = options.authDirectory ?? "./auth_info";

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
    await this.loadAuth();
    this.messageModules = await loadMessageModules();
    console.log(`${this.messageModules.length} message module(s) dimuat.`);
    await this.connect();
  }

  private async connect() {
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: this.state,
      logger: this.logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
    });

    socket.ev.on("creds.update", this.saveCreds);

    let pairingRequestStarted = false;

    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr && this.authMethod === "qr") {
        console.log("Scan QR berikut melalui WhatsApp > Perangkat tertaut:");
        qrcode.generate(qr, { small: true });
      }

      if (
        qr &&
        this.authMethod === "pairing" &&
        !this.state.creds.registered &&
        !pairingRequestStarted
      ) {
        pairingRequestStarted = true;
        void (async () => {
          try {
            const code = await socket.requestPairingCode(this.phoneNumber!);
            console.log(`Kode pairing WhatsApp: ${code}`);
            console.log(
              "Masukkan segera di WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.",
            );
          } catch (error) {
            pairingRequestStarted = false;
            console.error("Gagal meminta pairing code:", error);
          }
        })();
      }

      if (connection === "open") console.log("WhatsApp terhubung.");
      if (connection !== "close") return;

      const error = lastDisconnect?.error as
        { output?: { statusCode?: number }; message?: string } | undefined;
      const statusCode = error?.output?.statusCode;
      console.error(
        `Koneksi ditutup (status ${statusCode ?? "tidak diketahui"}${error?.message ? `: ${error.message}` : ""}).`,
      );

      if (statusCode === DisconnectReason.loggedOut) {
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
      setTimeout(() => void this.connect(), 2_000);
    });

    socket.ev.on("messages.upsert", async ({ type, messages }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        const parsed = parsedMessage(socket, message);
        if (!parsed || parsed.fromMe) continue;
        await parsed.read();

        if (parsed.quoted) console.log(`\n ↶ reply ke: ${parsed.quoted.text}`);
        console.log(
          `${!parsed.quoted ? "\n" : ""}[${parsed.isGroup ? "GROUP" : "DM"}] ${parsed.pushName} (${parsed.senderNumber}): ${parsed.text}`,
        );

        void dispatchMessage(this.messageModules, { message: parsed, socket });
      }
    });
  }
}
