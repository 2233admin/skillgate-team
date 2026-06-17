import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface MatterResult<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  content: string;
}

/** YAML frontmatter parser compatible with gray-matter's default export. */
export function matter<T extends Record<string, unknown> = Record<string, unknown>>(
  input: string,
): MatterResult<T> {
  const trimmed = input.replace(/^\uFEFF/, "");
  const match = trimmed.match(FRONTMATTER_RE);
  if (!match) {
    return { data: {} as T, content: trimmed };
  }

  const [, yamlBlock, body] = match;
  let data = {} as T;
  try {
    const parsed = parseYaml(yamlBlock, { prettyErrors: false });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as T;
    }
  } catch {
    data = {} as T;
  }

  return { data, content: body ?? "" };
}

export default matter;