import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
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

    if (this.authMethod === "pairing" && !this.phoneNumber) {
      throw new Error(
        "Set PHONE_NUMBER dengan kode negara, tanpa tanda + atau spasi.",
      );
    }
  }

  async start() {
    const auth = await useMultiFileAuthState(this.authDirectory);
    this.state = auth.state;
    this.saveCreds = auth.saveCreds;
    this.messageModules = await loadMessageModules();
    console.log(`${this.messageModules.length} message module(s) dimuat.`);
    this.connect();
  }

  private connect() {
    const socket = makeWASocket({
      auth: this.state,
      logger: this.logger,
      printQRInTerminal: false,
      browser: ["Foikliz Wabot", "Chrome", "1.0.0"],
    });

    socket.ev.on("creds.update", this.saveCreds);
    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr && this.authMethod === "qr") {
        console.log("Scan QR berikut melalui WhatsApp > Perangkat tertaut:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") console.log("WhatsApp terhubung.");
      if (connection !== "close") return;

      const error = lastDisconnect?.error as
        { output?: { statusCode?: number } } | undefined;
      if (error?.output?.statusCode === DisconnectReason.loggedOut) {
        console.error("Sesi logout. Hapus auth_info lalu autentikasi ulang.");
        process.exitCode = 1;
        return;
      }

      console.log("Koneksi terputus. Mencoba menghubungkan kembali...");
      this.connect();
    });

    socket.ev.on("messages.upsert", async ({ type, messages }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        const parsed = parsedMessage(socket, message);
        if (!parsed || parsed.fromMe) continue;
        await parsed.read();

        if (parsed.quoted) console.log(`\n ↶ reply ke: ${parsed.quoted.text}`);
        console.log(
          `${!parsed.quoted ? "\n" : ""}[${parsed.isGroup ? "GROUP" : "DM"}] ${parsed.pushName} (${parsed.sender}): ${parsed.text}`,
        );

        void dispatchMessage(this.messageModules, { message: parsed, socket });
      }
    });

    if (
      this.authMethod === "pairing" &&
      !this.state.creds.registered &&
      !this.pairingCodeRequested
    ) {
      this.pairingCodeRequested = true;
      setTimeout(async () => {
        try {
          const code = await socket.requestPairingCode(this.phoneNumber!);
          console.log(`Kode pairing WhatsApp: ${code}`);
          console.log(
            "Masukkan di WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.",
          );
        } catch (error) {
          this.pairingCodeRequested = false;
          console.error("Gagal meminta pairing code:", error);
          process.exitCode = 1;
        }
      }, 3_000);
    }
  }
}
