import { prisma } from "../../lib/prisma";
import type { PropertyContext } from "./types";

export const getPropertyContext = async (propertyId: string): Promise<PropertyContext | null> => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        content: true,
        amenities: true,
        stayPolicy: true,
        cancellationPolicies: true,
      },
    });

    if (!property) {
      return null;
    }

    return {
      propertyId: property.id,
      timezone: property.timezone,
      defaultCurrency: property.defaultCurrency,
      name: property.name,
      addressLine1: property.addressLine1,
      city: property.city,
      state: property.state,
      postalCode: property.postalCode,
      country: property.country,
      phone: property.phone,
      email: property.email,
      content: property.content
        ? {
            overviewMarketing: property.content.overviewMarketing,
            neighborhoodHighlights: property.content.neighborhoodHighlights ?? undefined,
            vibeTags: property.content.vibeTags,
          }
        : undefined,
      amenities: property.amenities.map((amenity) => ({
        key: amenity.key,
        detailsJson: amenity.detailsJson ?? undefined,
      })),
      stayPolicy: property.stayPolicy
        ? {
            checkInTime: property.stayPolicy.checkInTime,
            checkOutTime: property.stayPolicy.checkOutTime,
            lateCheckoutTime: property.stayPolicy.lateCheckoutTime,
            lateCheckoutFeeCents: property.stayPolicy.lateCheckoutFeeCents,
            lateCheckoutCurrency: property.stayPolicy.lateCheckoutCurrency,
            afterHoursArrivalCutoff: property.stayPolicy.afterHoursArrivalCutoff,
            afterHoursArrivalInstructions: property.stayPolicy.afterHoursArrivalInstructions,
            smokingPenaltyCents: property.stayPolicy.smokingPenaltyCents,
            smokingPenaltyCurrency: property.stayPolicy.smokingPenaltyCurrency,
            petFeePerNightCents: property.stayPolicy.petFeePerNightCents,
            petFeeCurrency: property.stayPolicy.petFeeCurrency,
            petPolicyRequiresNoteAtBooking: property.stayPolicy.petPolicyRequiresNoteAtBooking,
            dogFriendlyRoomsLimited: property.stayPolicy.dogFriendlyRoomsLimited,
            idRequired: property.stayPolicy.idRequired,
            creditCardRequired: property.stayPolicy.creditCardRequired,
            termsText: property.stayPolicy.termsText,
          }
        : undefined,
      cancellationPolicies: property.cancellationPolicies.map((policy) => ({
        id: policy.id,
        name: policy.name,
        appliesToRoomTypeIds: policy.appliesToRoomTypeIds,
        effectiveStartMonthDay: policy.effectiveStartMonthDay,
        effectiveEndMonthDay: policy.effectiveEndMonthDay,
        freeCancelDaysBefore: policy.freeCancelDaysBefore,
        freeCancelCutoffTime: policy.freeCancelCutoffTime,
        penaltyType: policy.penaltyType,
        penaltyValue: policy.penaltyValue,
        chargeHoursBeforeArrival: policy.chargeHoursBeforeArrival,
        policyTextLong: policy.policyTextLong,
        policySummaryTemplate: policy.policySummaryTemplate,
        priority: policy.priority,
      })),
    };
  } catch {
    return null;
  }
};
