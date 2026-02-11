import { prisma } from "../../lib/prisma";

export type ResolvedProperty = {
  propertyId: string;
  propertyExists: boolean;
};

type PropertyLookupClient = {
  property: {
    findUnique: (args: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
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
  } catch {
    // Fall through to existing v1 default behavior.
  }

  return {
    propertyId: "demo_property",
    propertyExists: false,
  };
};
