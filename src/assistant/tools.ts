import type { ParsedMessage } from "../parser";
import type { LoadedMessageModule, ModuleMeta } from "../modules";
import type { AssistantPlan } from "./client";

export interface AssistantToolContext {
  message: ParsedMessage;
  modules: ModuleMeta[];
  aiTools: LoadedMessageModule[];
}

function findArgumentProblem(
  meta: ModuleMeta,
  args: Record<string, unknown>,
): string | undefined {
  const schema = meta.ai?.parameters;
  if (!schema) return "Metadata parameter tool ini belum dikonfigurasi.";

  const unknown = Object.keys(args).filter(
    (name) => !(name in schema.properties),
  );
  if (unknown.length) {
    return `Parameter tidak dikenal: ${unknown.join(", ")}.`;
  }

  const missing = (schema.required ?? []).filter((name) => {
    const value = args[name];
    return value === undefined || value === null || value === "";
  });
  if (missing.length) {
    const descriptions = missing.map((name) =>
      schema.properties[name]?.description
        ? `${name} (${schema.properties[name].description})`
        : name,
    );
    return `Saya masih memerlukan: ${descriptions.join(", ")}.`;
  }

  for (const [name, property] of Object.entries(schema.properties)) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    const validType =
      property.type === "string"
        ? typeof value === "string"
        : property.type === "boolean"
          ? typeof value === "boolean"
          : property.type === "integer"
            ? Number.isInteger(value)
            : typeof value === "number" && Number.isFinite(value);
    if (!validType) return `Parameter ${name} harus bertipe ${property.type}.`;
    if (property.enum && !property.enum.includes(value as never)) {
      return `Nilai ${name} harus salah satu dari: ${property.enum.join(", ")}.`;
    }
  }
  return undefined;
}

export async function executeAssistantTool(
  plan: AssistantPlan,
  { message, modules, aiTools }: AssistantToolContext,
): Promise<string> {
  if (plan.tool === "none") {
    return (
      plan.response ||
      "Saya belum yakin tindakan apa yang Anda inginkan. Bisa jelaskan lebih spesifik?"
    );
  }

  const tool = aiTools.find(
    (module) => module.meta?.name === plan.tool && module.executeAI,
  );
  if (!tool?.meta || !tool.executeAI) {
    return "Tool tersebut tidak tersedia.";
  }

  const problem = findArgumentProblem(tool.meta, plan.args);
  if (problem) return problem;

  return tool.executeAI({ message, modules }, plan.args);
}
