import { cookies } from "next/headers";
import { prisma } from "@agentdesk/db";
import type { UserRole } from "@agentdesk/shared";

export type AuthProviderName = "local-demo" | "disabled";

export type AuthContext = {
  provider: AuthProviderName;
  userId: string;
};

export function isDemoAuthEnabled(): boolean {
  return (
    process.env.AUTH_PROVIDER === "local-demo" ||
    process.env.ALLOW_DEMO_AUTH === "true" ||
    (process.env.AUTH_PROVIDER == null && process.env.NODE_ENV !== "production")
  );
}

export function getAuthProviderName(): AuthProviderName {
  return isDemoAuthEnabled() ? "local-demo" : "disabled";
}

async function getAuthContext(): Promise<AuthContext | null> {
  if (!isDemoAuthEnabled()) {
    return null;
  }

  const activeUserId = cookies().get("activeUserId")?.value;
  if (activeUserId) {
    return { provider: "local-demo", userId: activeUserId };
  }

  const firstUser = await prisma.user.findFirst({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return firstUser ? { provider: "local-demo", userId: firstUser.id } : null;
}

export async function getCurrentUser() {
  const authContext = await getAuthContext();
  if (!authContext) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: authContext.userId },
    include: { team: true, organization: true }
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("No authenticated user found. Enable local demo auth or configure a production identity provider.");
  }
  return user;
}

export async function getUsersForSwitcher() {
  if (!isDemoAuthEnabled()) {
    return [];
  }

  try {
    return await prisma.user.findMany({
      include: { team: true, organization: true },
      orderBy: [{ organizationId: "asc" }, { role: "asc" }, { name: "asc" }]
    });
  } catch {
    return [];
  }
}

export function roleCanSeeOperations(role: UserRole): boolean {
  return role !== "VIEWER";
}
