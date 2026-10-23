import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // /play is a duplicate; only public canonical pages belong here.
  // Do not invent lastModified timestamps from the build time.
  return [{ url: absoluteUrl() }, { url: absoluteUrl("guide/") }];
}
