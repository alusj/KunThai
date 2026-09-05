import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const transportSource = readFileSync(new URL("../../components/transport/Transport.jsx", import.meta.url), "utf8");
const nearbyAreaSource = readFileSync(new URL("../../components/transport/NearbyAreaScreen.jsx", import.meta.url), "utf8");
const emergencySource = readFileSync(new URL("../../components/emergency/EmergencySheet.jsx", import.meta.url), "utf8");

test("every Area View entrance mounts at the document overlay root", () => {
  assert.match(transportSource, /createPortal\([\s\S]*document\.body/);
  assert.match(transportSource, /fixed inset-0 z-\[1400\] overflow-hidden/);
  assert.match(transportSource, /document\.body\.style\.overflow = "hidden"/);
});

test("Nearby Area guidance and emergency help float over the map without adding layout height", () => {
  assert.match(nearbyAreaSource, /presentation="map"/);
  assert.match(nearbyAreaSource, /pointer-events-none absolute inset-0 z-\[80\]/);
  assert.match(nearbyAreaSource, /h-\[75dvh\] max-h-\[75dvh\]/);
  assert.match(emergencySource, /pointer-events-none absolute inset-0 z-\[90\]/);
  assert.match(emergencySource, /h-\[75dvh\] max-h-\[75dvh\]/);
});

test("Nearby Area caution guide includes late-route advice and direct emergency support", () => {
  assert.match(nearbyAreaSource, /isLateRouteHour\(\)/);
  assert.match(nearbyAreaSource, /guideLateActiveTitle/);
  assert.match(nearbyAreaSource, /guideEmergencyHelpBody/);
  assert.match(nearbyAreaSource, /guideEmergencySupport/);
  assert.match(nearbyAreaSource, /onEmergencySupport=\{openEmergencyMode\}/);
});
