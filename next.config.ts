import type { NextConfig } from "next";
import { readSiteUrl } from "./src/lib/site";

const pagesExport = process.env.PAGES_EXPORT === "1";
const config: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  ...(pagesExport ? {
    output: "export",
    basePath: readSiteUrl().pathname.replace(/\/$/, ""),
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
};
export default config;
