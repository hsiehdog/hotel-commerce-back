import { describe, expect, it } from "vitest";
import { resolvePropertyIdForRequest } from "../services/propertyContext/resolvePropertyIdForRequest";

describe("resolvePropertyIdForRequest", () => {
  it("uses requested property when it exists", async () => {
    const fakeClient = {
      property: {
        findUnique: async () => ({ id: "inn_at_mount_shasta" }),
        findFirst: async () => null,
      },
    };

    const resolved = await resolvePropertyIdForRequest("inn_at_mount_shasta", fakeClient);

    expect(resolved).toEqual({
      propertyId: "inn_at_mount_shasta",
      propertyExists: true,
    });
  });

  it("falls back to first property when requested property does not exist", async () => {
    const fakeClient = {
      property: {
        findUnique: async () => null,
        findFirst: async () => ({ id: "fallback_property" }),
      },
    };

    const resolved = await resolvePropertyIdForRequest("missing_property", fakeClient);

    expect(resolved).toEqual({
      propertyId: "fallback_property",
      propertyExists: true,
    });
  });

  it("falls back to demo defaults when no properties exist", async () => {
    const fakeClient = {
      property: {
        findUnique: async () => null,
        findFirst: async () => null,
      },
    };

    const resolved = await resolvePropertyIdForRequest(undefined, fakeClient);

    expect(resolved).toEqual({
      propertyId: "demo_property",
      propertyExists: false,
    });
  });
});
