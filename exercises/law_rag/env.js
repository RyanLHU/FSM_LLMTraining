import { readFileSync } from "node:fs";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function loadEnvFile(path) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  contents.split(/\r?\n/).forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();
    const separator = line.indexOf("=");
    const key = separator < 0 ? line.trim() : line.slice(0, separator).trim();
    if (separator < 0 || !KEY_PATTERN.test(key)) {
      console.warn(`Warning: ignoring invalid .env line ${index + 1}`);
      return;
    }
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trimEnd();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}
