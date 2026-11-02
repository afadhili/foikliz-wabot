import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const stateDirectory = join(process.cwd(), "data");
const statePath = join(stateDirectory, "ai-modes.json");
let modes: Record<string, boolean> | undefined;
let pendingWrite = Promise.resolve();

async function loadModes() {
  if (modes) return modes;
  try {
    modes = JSON.parse(await readFile(statePath, "utf8")) as Record<
      string,
      boolean
    >;
  } catch {
    modes = {};
  }
  return modes;
}

export async function isAssistantEnabled(userKey: string): Promise<boolean> {
  return (await loadModes())[userKey] === true;
}

export async function setAssistantEnabled(userKey: string, enabled: boolean) {
  const state = await loadModes();
  state[userKey] = enabled;
  await mkdir(stateDirectory, { recursive: true });

  const nextPath = `${statePath}.tmp`;
  pendingWrite = pendingWrite.then(async () => {
    await writeFile(nextPath, JSON.stringify(state, null, 2), "utf8");
    await rename(nextPath, statePath);
  });
  await pendingWrite;
}
