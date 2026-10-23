import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  // Project Pages /repo/robots.txt is only a template: publish/merge at the host root.
  return { rules: { userAgent: "*", allow: "/" }, sitemap: absoluteUrl("sitemap.xml") };
}
