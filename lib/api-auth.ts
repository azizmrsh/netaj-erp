import { prisma } from "@/lib/prisma";
import { AuthRequirement, authErrorResponse, requireAuthorization, sessionTokenFromRequest } from "@/lib/auth";

export async function authorizeRequest(request: Request, requirement: AuthRequirement) {
  return prisma.$transaction((tx) => requireAuthorization(tx, sessionTokenFromRequest(request), requirement));
}

export { authErrorResponse };
