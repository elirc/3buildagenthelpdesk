import { prisma } from "@agentdesk/db";
import { authenticateApiRequest, jsonResponse, methodNotAllowed, parseApiPagination } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:incidents");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const pagination = parseApiPagination(url);
  const where = { organizationId: auth.caller.organizationId };

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: { owner: true, _count: { select: { tickets: true } } },
      orderBy: { startedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take
    }),
    prisma.incident.count({ where })
  ]);

  return jsonResponse({
    data: incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      affectedService: incident.affectedService,
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      owner: incident.owner ? { name: incident.owner.name } : null,
      ticketCount: incident._count.tickets
    })),
    pagination: { page: pagination.page, pageSize: pagination.pageSize, total }
  });
}

export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
