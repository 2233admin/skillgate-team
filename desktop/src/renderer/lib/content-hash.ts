/** SHA-256 hex digest for SKILL.md content (renderer, Web Crypto). */
export async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest("SHA-256", enc)
  const bytes = new Uint8Array(buf)
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0")
  }
  return out
}