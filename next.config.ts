import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Claude desktop app sets ANTHROPIC_API_KEY="" in the shell environment.
// Next.js never overwrites existing env vars with .env.local, so the key
// appears empty in API routes. Force-read from .env.local here.
function getEnvLocalValue(key: string): string | undefined {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  env: {
    ANTHROPIC_API_KEY: getEnvLocalValue("ANTHROPIC_API_KEY") ?? "",
  },
};

export default nextConfig;
