import { prisma } from "@agentdesk/db";
import { authenticateApiRequest, jsonResponse, methodNotAllowed, notFoundResponse } from "../../../../../lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(request, "read:tickets");
  if ("error" in auth) return auth.error;

  // Scoped by organization in the query itself, so a correctly-guessed id
  // belonging to another tenant is indistinguishable from one that does
  // not exist.
  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: auth.caller.organizationId },
    include: { assignedUser: true, assignedTeam: true, incident: true }
  });

  if (!ticket) return notFoundResponse();

  return jsonResponse({
    data: {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      customerName: ticket.customerName,
      tags: ticket.tags,
      slaDueAt: ticket.slaDueAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      firstRespondedAt: ticket.firstRespondedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      assignee: ticket.assignedUser ? { name: ticket.assignedUser.name } : null,
      team: ticket.assignedTeam ? { name: ticket.assignedTeam.name } : null,
      incident: ticket.incident ? { id: ticket.incident.id, title: ticket.incident.title, severity: ticket.incident.severity } : null
    }
  });
}

export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
