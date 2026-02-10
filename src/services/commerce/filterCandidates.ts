import type { Candidate } from "./types";

export type FilterResult = {
  candidates: Candidate[];
  activeBasis: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax" | null;
  reasonCodes: string[];
};

export const filterCandidates = ({
  candidates,
  requestCurrency,
  partySize,
  nights,
}: {
  candidates: Candidate[];
  requestCurrency: string;
  partySize: number;
  nights: number;
}): FilterResult => {
  const reasonCodes = new Set<string>();

  const hardFiltered = candidates.filter((candidate) => {
    if (typeof candidate.maxOccupancy === "number" && partySize > candidate.maxOccupancy) {
      reasonCodes.add("FILTER_OCCUPANCY");
      return false;
    }
    if (candidate.closedToArrival || candidate.closedToDeparture) {
      reasonCodes.add("FILTER_RESTRICTIONS");
      return false;
    }
    if (typeof candidate.minLengthOfStay === "number" && nights < candidate.minLengthOfStay) {
      reasonCodes.add("FILTER_RESTRICTIONS");
      return false;
    }
    if (typeof candidate.maxLengthOfStay === "number" && nights > candidate.maxLengthOfStay) {
      reasonCodes.add("FILTER_RESTRICTIONS");
      return false;
    }
    if (candidate.currency !== requestCurrency) {
      reasonCodes.add("FILTER_CURRENCY_MISMATCH");
      return false;
    }
    if (!Number.isFinite(candidate.price.amount)) {
      reasonCodes.add("FILTER_PRICE_MISSING");
      return false;
    }
    return true;
  });

  const afterTax = hardFiltered.filter((candidate) => candidate.price.basis === "afterTax");
  const beforeTaxPlusTaxes = hardFiltered.filter((candidate) => candidate.price.basis === "beforeTaxPlusTaxes");
  const beforeTax = hardFiltered.filter((candidate) => candidate.price.basis === "beforeTax");

  if (afterTax.length > 0) {
    return { candidates: afterTax, activeBasis: "afterTax", reasonCodes: Array.from(reasonCodes) };
  }
  if (beforeTaxPlusTaxes.length > 0) {
    return { candidates: beforeTaxPlusTaxes, activeBasis: "beforeTaxPlusTaxes", reasonCodes: Array.from(reasonCodes) };
  }
  if (beforeTax.length > 0) {
    return { candidates: beforeTax, activeBasis: "beforeTax", reasonCodes: Array.from(reasonCodes) };
  }

  return {
    candidates: [],
    activeBasis: null,
    reasonCodes: Array.from(reasonCodes),
  };
};
