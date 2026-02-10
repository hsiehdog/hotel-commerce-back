/* eslint-disable no-console */
const { PrismaClient, CancellationPenaltyType } = require("@prisma/client");

const prisma = new PrismaClient();

const PROPERTY_ID = process.env.PROPERTY_ID || "inn_at_mount_shasta";
const SUITE_ROOM_TYPE_IDS = (process.env.SUITE_ROOM_TYPE_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const OVERVIEW_MARKETING =
  "Located in the heart of town, just minutes from shops, restaurants, hiking trails, waterfalls and the base of Mt. Shasta, the Inn at Mount Shasta is the perfect base camp from which to explore one of California's greatest treasures. Whether you're here to challenge yourself, find yourself or are just passing through, you'll enjoy our beautiful rooms and warm, local vibe.";

const TERMS_TEXT =
  "Check-in begins at 3:00 pm. We will gladly welcome you at any time, but if you expect to arrive after 10:00 pm, please contact the hotel directly to make arrangements. Guests are required to present a photo ID and credit card upon check-in. Please note that special requests are subject to availability and additional charges may apply. We have a limited number of dog-friendly rooms and dogs must be noted at the time of booking. A $25 daily pet fee applies. All of our rooms are non-smoking. There will be a minimum charge of $250 for any smoking in rooms or on balconies. Additional terms are included in the Privacy Policy on our website.";

const DEFAULT_CANCELLATION_TEXT =
  "You may cancel free of charge until 3:00 pm three days before your arrival date. Any modifications, no-shows or cancellations within 72 hours of arrival will result in a charge of the first night's room rate and tax. We reserve the right to charge your credit card beginning 72 hours prior to arrival for the total amount of your stay.";

const SUITE_CANCELLATION_TEXT =
  "For stays in our Premier Suite, Family Suite, or Bunk Suite from May 1 through September 30, you may cancel free of charge until 3:00 pm seven days before your arrival date. Any modifications, no-shows or cancellations within seven days will result in a charge of 100% of the reservation cost. We reserve the right to charge your credit card beginning seven days prior to arrival for the total amount of your stay.";

const WEATHER_AND_EXCEPTIONS_TEXT =
  "We are not responsible for weather conditions, road conditions, personal emergencies, schedule changes, sickness or any other event or circumstance that may impact your plans. The Dunsmuir and Mount Shasta area can experience significant weather patterns, from snow and ice in the winter to wildfires and smoke in the summer. Snow, wildfires, smoke, road construction and other similar events do not create exceptions to our cancellation policies. We are a small hotel and there are no exceptions (really!) to these policies.";

const AMENITY_KEYS = [
  "baggage_storage",
  "twenty_four_hour_checkin",
  "air_conditioning",
  "contactless_checkin_checkout",
  "designated_smoking_area",
  "express_checkin_checkout",
  "family_rooms",
  "fireplace",
  "outdoor_fireplace",
  "garden",
  "guest_parking",
  "opt_out_daily_room_cleaning",
  "heating",
  "internet",
  "invoices",
  "non_smoking_rooms",
];

async function main() {
  await prisma.property.upsert({
    where: { id: PROPERTY_ID },
    update: {
      pmsProvider: "cloudbeds",
      pmsPropertyId: "inn_at_mount_shasta",
      name: "The Inn at Mount Shasta",
      timezone: "America/Los_Angeles",
      defaultCurrency: "USD",
      addressLine1: "710 South Mount Shasta Blvd",
      city: "Mount Shasta",
      state: "California",
      postalCode: "96067",
      country: "US",
      phone: "(530) 918-9292",
      email: "guestservices@innatmountshasta.com",
    },
    create: {
      id: PROPERTY_ID,
      pmsProvider: "cloudbeds",
      pmsPropertyId: "inn_at_mount_shasta",
      name: "The Inn at Mount Shasta",
      timezone: "America/Los_Angeles",
      defaultCurrency: "USD",
      addressLine1: "710 South Mount Shasta Blvd",
      city: "Mount Shasta",
      state: "California",
      postalCode: "96067",
      country: "US",
      phone: "(530) 918-9292",
      email: "guestservices@innatmountshasta.com",
    },
  });

  await prisma.propertyContent.upsert({
    where: { propertyId: PROPERTY_ID },
    update: {
      overviewMarketing: OVERVIEW_MARKETING,
      vibeTags: ["warm", "local", "basecamp"],
      neighborhoodHighlights: {
        nearby: ["shops", "restaurants", "hiking trails", "waterfalls", "Mt. Shasta base area"],
      },
    },
    create: {
      propertyId: PROPERTY_ID,
      overviewMarketing: OVERVIEW_MARKETING,
      vibeTags: ["warm", "local", "basecamp"],
      neighborhoodHighlights: {
        nearby: ["shops", "restaurants", "hiking trails", "waterfalls", "Mt. Shasta base area"],
      },
    },
  });

  await prisma.propertyCommerceConfig.upsert({
    where: { propertyId: PROPERTY_ID },
    update: {
      strategyMode: "balanced",
      upsellPosture: "guest_first",
      cancellationSensitivity: "high",
      urgencyEnabled: true,
      allowedUrgencyTypes: JSON.stringify(["scarcity_rooms"]),
      defaultCurrency: "USD",
      enableTextLink: false,
      enableTransferFrontDesk: true,
      enableWaitlist: true,
      webBookingUrl: null,
      version: 1,
    },
    create: {
      propertyId: PROPERTY_ID,
      strategyMode: "balanced",
      upsellPosture: "guest_first",
      cancellationSensitivity: "high",
      urgencyEnabled: true,
      allowedUrgencyTypes: JSON.stringify(["scarcity_rooms"]),
      defaultCurrency: "USD",
      enableTextLink: false,
      enableTransferFrontDesk: true,
      enableWaitlist: true,
      webBookingUrl: null,
      version: 1,
    },
  });

  await prisma.propertyAmenity.deleteMany({ where: { propertyId: PROPERTY_ID } });
  await prisma.propertyAmenity.createMany({
    data: AMENITY_KEYS.map((key) => ({
      propertyId: PROPERTY_ID,
      key,
    })),
  });

  await prisma.propertyStayPolicy.upsert({
    where: { propertyId: PROPERTY_ID },
    update: {
      checkInTime: "15:00",
      checkOutTime: "11:00",
      lateCheckoutTime: "12:00",
      lateCheckoutFeeCents: 2500,
      lateCheckoutCurrency: "USD",
      afterHoursArrivalCutoff: "22:00",
      afterHoursArrivalInstructions: "please contact the hotel directly to make arrangements",
      smokingPenaltyCents: 25000,
      smokingPenaltyCurrency: "USD",
      petFeePerNightCents: 2500,
      petFeeCurrency: "USD",
      petPolicyRequiresNoteAtBooking: true,
      dogFriendlyRoomsLimited: true,
      idRequired: true,
      creditCardRequired: true,
      termsText: TERMS_TEXT,
    },
    create: {
      propertyId: PROPERTY_ID,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      lateCheckoutTime: "12:00",
      lateCheckoutFeeCents: 2500,
      lateCheckoutCurrency: "USD",
      afterHoursArrivalCutoff: "22:00",
      afterHoursArrivalInstructions: "please contact the hotel directly to make arrangements",
      smokingPenaltyCents: 25000,
      smokingPenaltyCurrency: "USD",
      petFeePerNightCents: 2500,
      petFeeCurrency: "USD",
      petPolicyRequiresNoteAtBooking: true,
      dogFriendlyRoomsLimited: true,
      idRequired: true,
      creditCardRequired: true,
      termsText: TERMS_TEXT,
    },
  });

  await prisma.propertyCancellationPolicy.deleteMany({ where: { propertyId: PROPERTY_ID } });
  await prisma.propertyCancellationPolicy.createMany({
    data: [
      {
        propertyId: PROPERTY_ID,
        name: "Default",
        appliesToRoomTypeIds: [],
        freeCancelDaysBefore: 3,
        freeCancelCutoffTime: "15:00",
        penaltyType: CancellationPenaltyType.FIRST_NIGHT_PLUS_TAX,
        chargeHoursBeforeArrival: 72,
        policyTextLong: `${DEFAULT_CANCELLATION_TEXT}\n\n${WEATHER_AND_EXCEPTIONS_TEXT}`,
        policySummaryTemplate:
          "Free cancellation until 3:00 PM 3 days before arrival. Inside 72 hours, first night plus tax applies.",
        priority: 100,
      },
      {
        propertyId: PROPERTY_ID,
        name: "Peak Suites May-Sep",
        appliesToRoomTypeIds: SUITE_ROOM_TYPE_IDS,
        effectiveStartMonthDay: "05-01",
        effectiveEndMonthDay: "09-30",
        freeCancelDaysBefore: 7,
        freeCancelCutoffTime: "15:00",
        penaltyType: CancellationPenaltyType.PERCENT_OF_STAY,
        penaltyValue: 100,
        chargeHoursBeforeArrival: 168,
        policyTextLong: `${SUITE_CANCELLATION_TEXT}\n\n${WEATHER_AND_EXCEPTIONS_TEXT}`,
        policySummaryTemplate:
          "For selected suites May 1-Sep 30, free cancellation until 3:00 PM 7 days before arrival. Inside 7 days, 100% of stay applies.",
        priority: 10,
      },
    ],
  });

  console.log(`Seeded property context for ${PROPERTY_ID}.`);
  if (SUITE_ROOM_TYPE_IDS.length === 0) {
    console.log(
      "Note: SUITE_ROOM_TYPE_IDS is empty. Set it to comma-separated roomTypeId values so the seasonal suite cancellation rule can match.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
