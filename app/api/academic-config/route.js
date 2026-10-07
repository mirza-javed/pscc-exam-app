import { resourceReadHandler } from "@/lib/resourceReadHandler.mjs";
export const dynamic = "force-dynamic";
export const GET = resourceReadHandler("config", "/api/academic-config");
