import { describe, expect, it } from "vitest";
import { CancellationPenaltyType } from "@prisma/client";
import { renderCancellationSummary } from "../services/propertyContext/renderCancellationSummary";
import { selectCancellationPolicy } from "../services/propertyContext/selectCancellationPolicy";
import type { PropertyCancellationPolicyRule } from "../services/propertyContext/types";

const basePolicy = (overrides: Partial<PropertyCancellationPolicyRule>): PropertyCancellationPolicyRule => ({
  id: "policy",
  name: "Policy",
  appliesToRoomTypeIds: [],
  effectiveStartMonthDay: null,
  effectiveEndMonthDay: null,
  freeCancelDaysBefore: 3,
  freeCancelCutoffTime: "15:00",
  penaltyType: CancellationPenaltyType.FIRST_NIGHT_PLUS_TAX,
  penaltyValue: null,
  chargeHoursBeforeArrival: 72,
  policyTextLong: null,
  policySummaryTemplate: null,
  priority: 100,
  ...overrides,
});

describe("property cancellation policy selector", () => {
  it("selects highest priority matching room type and date rule", () => {
    const policies: PropertyCancellationPolicyRule[] = [
      basePolicy({ id: "default", name: "Default", priority: 100 }),
      basePolicy({
        id: "peak_suite",
        name: "Peak Suite",
        appliesToRoomTypeIds: ["RT_SUITE"],
        effectiveStartMonthDay: "05-01",
        effectiveEndMonthDay: "09-30",
        freeCancelDaysBefore: 7,
        penaltyType: CancellationPenaltyType.PERCENT_OF_STAY,
        penaltyValue: 100,
        priority: 10,
      }),
    ];

    const selected = selectCancellationPolicy({
      policies,
      checkIn: "2026-07-10",
      roomTypeId: "rt_suite",
    });

    expect(selected?.id).toBe("peak_suite");
  });

  it("falls back to default when seasonal rule does not match", () => {
    const policies: PropertyCancellationPolicyRule[] = [
      basePolicy({ id: "default", name: "Default", priority: 100 }),
      basePolicy({
        id: "peak_suite",
        name: "Peak Suite",
        appliesToRoomTypeIds: ["RT_SUITE"],
        effectiveStartMonthDay: "05-01",
        effectiveEndMonthDay: "09-30",
        priority: 10,
      }),
    ];

    const selected = selectCancellationPolicy({
      policies,
      checkIn: "2026-12-10",
      roomTypeId: "rt_suite",
    });

    expect(selected?.id).toBe("default");
  });

  it("renders deterministic fallback summary when no template is set", () => {
    const summary = renderCancellationSummary({
      policy: basePolicy({
        freeCancelDaysBefore: 7,
        freeCancelCutoffTime: "15:00",
        penaltyType: CancellationPenaltyType.PERCENT_OF_STAY,
        penaltyValue: 100,
      }),
      refundability: "refundable",
      checkInDate: "2026-07-10",
      propertyTimezone: "America/Los_Angeles",
      now: new Date("2026-07-01T12:00:00-07:00"),
    });

    expect(summary).toMatch(/Jul 3, 3:00 PM/i);
    expect(summary).toMatch(/100% of stay/i);
  });

  it("renders deadline-passed wording for refundable plans when now is past cutoff", () => {
    const summary = renderCancellationSummary({
      policy: basePolicy({
        freeCancelDaysBefore: 3,
        freeCancelCutoffTime: "15:00",
        penaltyType: CancellationPenaltyType.FIRST_NIGHT_PLUS_TAX,
      }),
      refundability: "refundable",
      checkInDate: "2026-02-11",
      propertyTimezone: "America/Los_Angeles",
      now: new Date("2026-02-10T12:00:00-08:00"),
    });

    expect(summary).toMatch(/deadline passed/i);
    expect(summary).toMatch(/Feb 8, 3:00 PM/i);
    expect(summary).toMatch(/first night plus tax/i);
  });

  it("always renders non-refundable summary for non-refundable plans", () => {
    const summary = renderCancellationSummary({
      policy: basePolicy({
        freeCancelDaysBefore: 3,
        freeCancelCutoffTime: "15:00",
        penaltyType: CancellationPenaltyType.FIRST_NIGHT_PLUS_TAX,
      }),
      refundability: "non_refundable",
      checkInDate: "2026-02-11",
      propertyTimezone: "America/Los_Angeles",
      now: new Date("2026-02-10T12:00:00-08:00"),
    });

    expect(summary).toMatch(/non-refundable/i);
    expect(summary).not.toMatch(/free cancellation/i);
  });
});
