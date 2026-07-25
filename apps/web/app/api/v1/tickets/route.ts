import { prisma } from "@agentdesk/db";
import { authenticateApiRequest, jsonResponse, methodNotAllowed, parseApiPagination } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * The response shape is a contract. It is assembled field by field rather
 * than returned straight from Prisma, so adding a column to Ticket cannot
 * silently start publishing it to every integrator.
 */
function serializeTicket(ticket: {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  customerName: string;
  slaDueAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedUser: { name: string } | null;
  assignedTeam: { name: string } | null;
}) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    customerName: ticket.customerName,
    slaDueAt: ticket.slaDueAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    assignee: ticket.assignedUser ? { name: ticket.assignedUser.name } : null,
    team: ticket.assignedTeam ? { name: ticket.assignedTeam.name } : null
  };
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:tickets");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const pagination = parseApiPagination(url);
  const status = url.searchParams.get("status");

  const where = {
    organizationId: auth.caller.organizationId,
    mergedIntoId: null,
    ...(status ? { status: status as never } : {})
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: { assignedUser: true, assignedTeam: true },
      orderBy: { updatedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take
    }),
    prisma.ticket.count({ where })
  ]);

  return jsonResponse({
    data: tickets.map(serializeTicket),
    pagination: { page: pagination.page, pageSize: pagination.pageSize, total }
  });
}

export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
