import { describe, expect, it } from "vitest";
import {
  extractDeliveryPhotoBase64s,
  getPodPhotoUrls,
  getProofPhotoUrls,
} from "../shared/podPhotos";

describe("delivery POD photos", () => {
  it("keeps the legacy single-photo payload", () => {
    expect(extractDeliveryPhotoBase64s({ photoBase64: "first" })).toEqual([
      "first",
    ]);
  });

  it("accepts the canonical two-photo array", () => {
    expect(
      extractDeliveryPhotoBase64s({ photoBase64s: ["first", "second"] })
    ).toEqual(["first", "second"]);
  });

  it("accepts a separate second-photo field without duplicating the first", () => {
    expect(
      extractDeliveryPhotoBase64s({
        photoBase64: "first",
        photoBase64Second: "second",
        photoBase64s: ["first"],
      })
    ).toEqual(["first", "second"]);
  });

  it("limits a delivery to two photos", () => {
    expect(
      extractDeliveryPhotoBase64s({ photos: ["first", "second", "third"] })
    ).toEqual(["first", "second"]);
  });

  it("stores the recipient signature in the second slot after the photo", () => {
    expect(
      extractDeliveryPhotoBase64s({
        photoBase64: "photo",
        signatureBase64: "signature",
      })
    ).toEqual(["photo", "signature"]);
  });

  it("accepts a signature-only delivery", () => {
    expect(extractDeliveryPhotoBase64s({ signature: "signature" })).toEqual([
      "signature",
    ]);
  });

  it("ignores unknown fields and only reads named photo/signature fields", () => {
    expect(
      extractDeliveryPhotoBase64s({
        status: "delivered",
        notes: "left with neighbour",
        collectedAmount: 150.5,
        photoBase64: "photo",
      })
    ).toEqual(["photo"]);
  });

  it("returns both current and legacy URL fields for display", () => {
    expect(
      getPodPhotoUrls({ podFileUrl: "one.jpg", podFileUrl2: "two.jpg" })
    ).toEqual(["one.jpg", "two.jpg"]);
    expect(
      getProofPhotoUrls({ proofPhotoUrl: "one.jpg", proofPhotoUrl2: "two.jpg" })
    ).toEqual(["one.jpg", "two.jpg"]);
  });
});
