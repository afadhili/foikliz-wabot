import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WhatsAppSocket } from "../socket";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";

const dataDirectory = resolve("data");
const registryPath = join(dataDirectory, "managed-bots.json");
const authRoot = resolve("auth");
const active = new Map<string, WhatsAppSocket>();
const pending = new Map<string, Promise<string>>();
const primarySockets = new WeakSet<object>();
let primaryNumber = (process.env.PHONE_NUMBER ?? "").replace(/\D/g, "");
export function markPrimarySocket(socket: object) {
  primarySockets.add(socket);
}
export function isPrimarySocket(socket: object) {
  return primarySockets.has(socket);
}
let primaryOwnerSocket:
  | { sendMessage(jid: string, content: { text: string }): Promise<unknown> }
  | undefined;

function validId(number: string): boolean {
  return /^\d{8,15}$/.test(number) && !number.startsWith("0");
}

async function readRegistry(): Promise<string[]> {
  try {
    const values: unknown = JSON.parse(await readFile(registryPath, "utf8"));
    if (!Array.isArray(values)) return [];
    return [
      ...new Set(
        values.filter(
          (id): id is string => typeof id === "string" && validId(id),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

async function writeRegistry(ids: string[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(
    registryPath,
    `${JSON.stringify([...new Set(ids)].sort(), null, 2)}\n`,
    { mode: 0o600 },
  );
}

function authPath(id: string) {
  if (!validId(id)) throw new Error("ID bot tidak valid.");
  const path = resolve(authRoot, id);
  if (!path.startsWith(`${authRoot}/`)) throw new Error("ID bot tidak valid.");
  return path;
}

async function startManaged(
  id: string,
  pairing?: (code: string) => Promise<void>,
) {
  const dir = authPath(id);
  const auth = await useMultiFileAuthState(dir);
  if (!auth.state.creds.registered && !pairing) return false;
  const instance = new WhatsAppSocket({
    authMethod: "pairing",
    phoneNumber: id,
    authDirectory: dir,
    managed: true,
    onPairingCode: pairing,
  });
  active.set(id, instance);
  try {
    await instance.start();
    return true;
  } catch (error) {
    active.delete(id);
    await instance.stop();
    throw error;
  }
}

export async function startManagedBots(ownerSocket: typeof primaryOwnerSocket) {
  primaryOwnerSocket = ownerSocket;
  // Baileys exposes the authenticated PN on the primary socket; reject it even when the primary used QR.
  const jid =
    (ownerSocket as unknown as { user?: { id?: string; lid?: string } })?.user
      ?.id ?? "";
  const authenticatedNumber =
    jid.split(":")[0]?.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (validId(authenticatedNumber)) primaryNumber = authenticatedNumber;
  const ids = await readRegistry();
  for (const id of ids) {
    if (active.has(id) || id === primaryNumber) continue;
    try {
      const auth = await useMultiFileAuthState(authPath(id));
      if (!auth.state.creds.registered) {
        await writeRegistry(ids.filter((registered) => registered !== id));
        continue;
      }
      await startManaged(id);
    } catch (error) {
      console.error(`Gagal memulai bot terdaftar ${id}:`, error);
    }
  }
}

export async function createManagedBot(
  number: string,
  recipient: string,
): Promise<string> {
  if (!validId(number))
    throw new Error(
      "Nomor harus berupa 8-15 digit E.164 tanpa angka 0 di awal.",
    );
  if (number === primaryNumber)
    throw new Error("Nomor tersebut adalah akun bot utama.");
  if (
    active.has(number) ||
    pending.has(number) ||
    (await readRegistry()).includes(number)
  )
    throw new Error(
      "Bot untuk nomor tersebut sudah terdaftar atau sedang diproses.",
    );
  const task = (async () => {
    const dir = authPath(number);
    await rm(dir, { recursive: true, force: true });
    if (!primaryOwnerSocket)
      throw new Error("Socket utama belum siap mengirim pairing code.");
    let resolveCode!: (code: string) => void;
    let rejectCode!: (error: Error) => void;
    const codeReady = new Promise<string>((resolvePromise, rejectPromise) => {
      resolveCode = resolvePromise;
      rejectCode = rejectPromise;
    });
    const timeout = setTimeout(
      () =>
        rejectCode(new Error("Waktu tunggu pairing code habis. Coba lagi.")),
      60_000,
    );
    try {
      await startManaged(number, async (code) => {
        if (pending.get(number) !== task) return;
        try {
          if (!primaryOwnerSocket)
            throw new Error("Socket utama tidak tersedia.");
          await primaryOwnerSocket.sendMessage(recipient, {
            text: `Kode pairing untuk ${number}: *${code}*\nMasukkan di WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.`,
          });
          await writeRegistry([...(await readRegistry()), number]);
          resolveCode(code);
        } catch (error) {
          rejectCode(error instanceof Error ? error : new Error(String(error)));
        }
      });
      return await codeReady;
    } finally {
      clearTimeout(timeout);
    }
  })();
  pending.set(number, task);
  try {
    return await task;
  } catch (error) {
    const instance = active.get(number);
    active.delete(number);
    await instance?.stop();
    await writeRegistry((await readRegistry()).filter((id) => id !== number));
    await rm(authPath(number), { recursive: true, force: true });
    throw error;
  } finally {
    pending.delete(number);
  }
}

export async function removeManagedBot(number: string): Promise<void> {
  if (!validId(number))
    throw new Error(
      "Nomor harus berupa 8-15 digit E.164 tanpa angka 0 di awal.",
    );
  if (number === primaryNumber)
    throw new Error("Akun utama tidak dapat dihapus dengan perintah ini.");
  const instance = active.get(number);
  if (instance) await instance.stop({ logout: true });
  active.delete(number);
  await writeRegistry((await readRegistry()).filter((id) => id !== number));
  await rm(authPath(number), { recursive: true, force: true });
}
