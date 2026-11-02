import { WhatsAppSocket } from "./socket";

const authMethod = (process.env.AUTH_METHOD ?? "qr").toLowerCase();
if (authMethod !== "qr" && authMethod !== "pairing") {
  throw new Error('AUTH_METHOD harus bernilai "qr" atau "pairing".');
}

const socket = new WhatsAppSocket({
  authMethod,
  phoneNumber: process.env.PHONE_NUMBER,
});

await socket.start();
