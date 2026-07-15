import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["better-sqlite3", "node-edge-tts", "ws"],
  allowedDevOrigins: ["192.168.2.122", "MACdeMacBook-Air.local"],
};

export default nextConfig;
