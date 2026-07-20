import { getLatestReportForBearerToken } from "@/lib/reports";

/**
 * Milestone 12. Per api-contracts.md ("same shape as GET
 * /api/merchants/:id/report") and milestone 10's handoff seam note, this
 * literally delegates to the same shared logic the merchant-facing report
 * route uses — no reimplementation, and auth is not re-gated differently
 * here (it's already merchant-owner-or-lender in lib/reports.ts).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getLatestReportForBearerToken(request, id);
}
