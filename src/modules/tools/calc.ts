import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "calc",
  active: true,
  aliases: ["hitung"],
  description:
    "Kalkulator. Mendukung + - * / % ^, kurung, sqrt, abs, round, floor, ceil, sin, cos, tan, log, ln, pi, dan e.",
  usage: "ekspresi",
};

const MAX_LENGTH = 200;

const FUNCTIONS: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { type: "num" | "op" | "id"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (/\s/.test(char)) {
      index++;
    } else if (/[\d.]/.test(char)) {
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(input.slice(index));
      if (!match) throw new Error(`Angka tidak valid di posisi ${index + 1}.`);
      tokens.push({ type: "num", value: match[0] });
      index += match[0].length;
    } else if (/[a-zA-Z]/.test(char)) {
      const match = /^[a-zA-Z]+/.exec(input.slice(index))!;
      tokens.push({ type: "id", value: match[0].toLowerCase() });
      index += match[0].length;
    } else if (input.startsWith("**", index)) {
      tokens.push({ type: "op", value: "^" });
      index += 2;
    } else if ("+-*/%^()".includes(char)) {
      tokens.push({ type: "op", value: char });
      index++;
    } else if (char === "×") {
      tokens.push({ type: "op", value: "*" });
      index++;
    } else if (char === "÷") {
      tokens.push({ type: "op", value: "/" });
      index++;
    } else {
      throw new Error(`Karakter tidak didukung: "${char}".`);
    }
  }
  return tokens;
}

export function evaluate(input: string): number {
  const tokens = tokenize(input);
  let position = 0;

  const peek = () => tokens[position];
  const isOp = (value: string) => {
    const token = peek();
    return token?.type === "op" && token.value === value;
  };
  const expectOp = (value: string) => {
    if (!isOp(value)) throw new Error(`Diharapkan "${value}".`);
    position++;
  };

  function expression(): number {
    let value = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[position++]!.value;
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function term(): number {
    let value = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[position++]!.value;
      const right = unary();
      if ((op === "/" || op === "%") && right === 0) {
        throw new Error("Pembagian dengan nol.");
      }
      value =
        op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }

  function unary(): number {
    if (isOp("-")) {
      position++;
      return -unary();
    }
    if (isOp("+")) {
      position++;
      return unary();
    }
    return power();
  }

  function power(): number {
    const base = primary();
    if (isOp("^")) {
      position++;
      return base ** unary();
    }
    return base;
  }

  function primary(): number {
    const token = tokens[position++];
    if (!token) throw new Error("Ekspresi belum lengkap.");

    if (token.type === "num") return Number(token.value);
    if (token.type === "op" && token.value === "(") {
      const value = expression();
      expectOp(")");
      return value;
    }
    if (token.type === "id") {
      if (token.value in CONSTANTS) return CONSTANTS[token.value]!;
      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`Fungsi tidak dikenal: ${token.value}.`);
      expectOp("(");
      const value = expression();
      expectOp(")");
      return fn(value);
    }
    throw new Error(`Token tidak terduga: "${token.value}".`);
  }

  const result = expression();
  if (position < tokens.length) {
    throw new Error(`Token tidak terduga: "${tokens[position]!.value}".`);
  }
  if (!Number.isFinite(result)) throw new Error("Hasil tidak terdefinisi.");
  return result;
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "calc" && command?.name !== "hitung") return;

  const input = command.rest.trim();
  if (!input) {
    await message.reply(
      `Format: ${command.prefix}calc ${meta.usage}\nContoh: ${command.prefix}calc (12 + 8) * 3 / 4`,
    );
    return;
  }
  if (input.length > MAX_LENGTH) {
    await message.reply(
      `Ekspresi terlalu panjang (maksimal ${MAX_LENGTH} karakter).`,
    );
    return;
  }

  try {
    const result = Number(evaluate(input).toPrecision(12));
    await message.reply(`${input} = *${result}*`);
  } catch (error) {
    await message.reply(
      `Ekspresi tidak valid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
