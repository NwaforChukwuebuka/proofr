import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

/**
 * OpenAPI JSON for Swagger UI / external tools.
 * GET /api/openapi
 */
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  });
}
