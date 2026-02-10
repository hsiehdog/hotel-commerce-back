import { prisma } from "../../lib/prisma";

export type ResolvedProperty = {
  propertyId: string;
  propertyExists: boolean;
};

type PropertyLookupClient = {
  property: {
    findUnique: (args: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
    findFirst: (args: { orderBy: { createdAt: "asc" }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
};

export const resolvePropertyIdForRequest = async (
  requestedPropertyId?: string,
  client: PropertyLookupClient = prisma as unknown as PropertyLookupClient,
): Promise<ResolvedProperty> => {
  try {
    if (requestedPropertyId) {
      const requested = await client.property.findUnique({
        where: { id: requestedPropertyId },
        select: { id: true },
      });
      if (requested) {
        return { propertyId: requested.id, propertyExists: true };
      }
    }

    const firstProperty = await client.property.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstProperty) {
      return { propertyId: firstProperty.id, propertyExists: true };
    }
  } catch {
    // Fall through to existing v1 default behavior.
  }

  return {
    propertyId: requestedPropertyId ?? "demo_property",
    propertyExists: false,
  };
};
