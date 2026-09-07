/**
 * PHASE 9.4 — Rejection reason presentation unit tests (Node built-in test).
 *
 * Exercises the PURE mapping module `features/attendance/rejection-reasons.ts`
 * so the Indonesian labels/messages/tones shown to employees and management are
 * deterministic, safe and never leak internal details. No DB/GPS/network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLocationRejectionMessage,
  rejectionReasonLabel,
  rejectionReasonMessage,
  rejectionReasonTone,
} from "../../features/attendance/rejection-reasons.ts";

const REQUIRED_REASONS = [
  "outside_geofence",
  "poor_accuracy",
  "missing_accuracy",
  "geofence_not_configured",
  "invalid_coordinates",
  "denied",
  "unavailable",
  "work_location_missing",
  "project_or_location_not_eligible",
];

describe("rejectionReasonLabel", () => {
  it("provides an Indonesian label for every required reason", () => {
    const expected: Record<string, string> = {
      outside_geofence: "Di Luar Area",
      poor_accuracy: "GPS Kurang Akurat",
      missing_accuracy: "Akurasi GPS Tidak Tersedia",
      geofence_not_configured: "Geofence Belum Dikonfigurasi",
      invalid_coordinates: "Koordinat Tidak Valid",
      denied: "Izin Lokasi Ditolak",
      unavailable: "Lokasi Tidak Tersedia",
      work_location_missing: "Lokasi Kerja Tidak Ditemukan",
      project_or_location_not_eligible: "Lokasi Tidak Tersedia",
    };
    for (const reason of REQUIRED_REASONS) {
      assert.equal(
        rejectionReasonLabel(reason),
        expected[reason],
        `label for ${reason}`
      );
    }
  });

  it("preserves legacy aliases with the same visible label", () => {
    assert.equal(rejectionReasonLabel("location_permission_denied"), "Izin Lokasi Ditolak");
    assert.equal(rejectionReasonLabel("location_unavailable"), "Lokasi Tidak Tersedia");
  });

  it("returns an em-dash for a missing reason", () => {
    assert.equal(rejectionReasonLabel(null), "—");
    assert.equal(rejectionReasonLabel(""), "—");
    assert.equal(rejectionReasonLabel(undefined), "—");
  });

  it("falls back to a safe generic label for unknown reasons", () => {
    assert.equal(rejectionReasonLabel("some_future_reason"), "Alasan Tidak Diketahui");
  });
});

describe("rejectionReasonMessage", () => {
  it("provides a non-fallback Indonesian message for every required reason", () => {
    for (const reason of REQUIRED_REASONS) {
      const message = rejectionReasonMessage(reason);
      assert.ok(message.length > 10, `message for ${reason}`);
      assert.notEqual(message, rejectionReasonMessage("unknown_reason"));
      assert.ok(!message.includes("Error") && !message.includes("stack"));
    }
  });

  it("falls back for unknown reasons", () => {
    const fallback = rejectionReasonMessage("totally_unknown");
    assert.match(fallback, /hubungi Management\/HR|coba lagi/);
  });
});

describe("rejectionReasonTone", () => {
  it("marks hard failures destructive and softer issues secondary", () => {
    assert.equal(rejectionReasonTone("outside_geofence"), "destructive");
    assert.equal(rejectionReasonTone("poor_accuracy"), "destructive");
    assert.equal(rejectionReasonTone("invalid_coordinates"), "destructive");
    assert.equal(rejectionReasonTone("denied"), "destructive");
    assert.equal(rejectionReasonTone("missing_accuracy"), "secondary");
    assert.equal(rejectionReasonTone("geofence_not_configured"), "secondary");
    assert.equal(rejectionReasonTone("work_location_missing"), "secondary");
    assert.equal(rejectionReasonTone("project_or_location_not_eligible"), "secondary");
  });

  it("falls back to outline for null/unknown reasons", () => {
    assert.equal(rejectionReasonTone(null), "outline");
    assert.equal(rejectionReasonTone("unknown_reason"), "outline");
  });
});

describe("buildLocationRejectionMessage", () => {
  it("outside_geofence includes server distance and radius when available", () => {
    const message = buildLocationRejectionMessage("outside_geofence", {
      distanceMeters: 244.6,
      radiusMeters: 150,
    });
    assert.match(message, /Jarak Anda: 245 m/);
    assert.match(message, /radius yang diizinkan: 150 m/);
    assert.match(message, /di luar area kerja/);
  });

  it("outside_geofence omits distance clause when unavailable (no misleading data)", () => {
    const message = buildLocationRejectionMessage("outside_geofence", {});
    assert.match(message, /di luar area kerja/);
    assert.ok(!message.includes("Jarak"), "must not fabricate a distance");
  });

  it("poor_accuracy includes GPS accuracy when available", () => {
    const message = buildLocationRejectionMessage("poor_accuracy", {
      accuracyMeters: 168,
    });
    assert.match(message, /akurasi ±168 m/);
    assert.match(message, /sinyal GPS/);
  });

  it("poor_accuracy omits the accuracy clause when unavailable", () => {
    const message = buildLocationRejectionMessage("poor_accuracy", {});
    assert.ok(!message.includes("±"), "must not fabricate accuracy");
  });

  it("provides clear messages for the remaining required reasons", () => {
    const expectedSubstrings: Record<string, RegExp> = {
      missing_accuracy: /akurasi GPS tidak tersedia/i,
      geofence_not_configured: /belum dikonfigurasi/i,
      invalid_coordinates: /koordinat lokasi tidak valid/i,
      denied: /izin lokasi/i,
      location_permission_denied: /izin lokasi/i,
      unavailable: /lokasi tidak dapat ditentukan/i,
      location_unavailable: /lokasi tidak dapat ditentukan/i,
      work_location_missing: /lokasi kerja tidak ditemukan/i,
      project_or_location_not_eligible: /tidak tersedia/i,
    };
    for (const [reason, pattern] of Object.entries(expectedSubstrings)) {
      assert.match(buildLocationRejectionMessage(reason), pattern, reason);
    }
  });

  it("falls back safely for an unexpected reason", () => {
    const message = buildLocationRejectionMessage("future_reason_xyz", {
      distanceMeters: 100,
    });
    assert.ok(!message.includes("future_reason_xyz"));
    assert.ok(message.length > 10);
  });
});
