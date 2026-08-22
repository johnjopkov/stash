import assert from "node:assert/strict";
import test from "node:test";
import {
  getClampedEdgeSize,
  getZoomTranslationDelta,
  isContinuousWheelEvent,
  shouldNavigateWheelEvent,
} from "./LightboxInput.js";

test("classifies wheel streams by event shape instead of claiming a device", () => {
  assert.equal(isContinuousWheelEvent(3, 0, null), true);
  assert.equal(isContinuousWheelEvent(24, 0, 3), true);
  assert.equal(isContinuousWheelEvent(100, 0, null), false);
  assert.equal(isContinuousWheelEvent(3, 1, null), false);
});

test("navigates every discrete wheel step but only once per continuous gesture", () => {
  assert.equal(shouldNavigateWheelEvent(false, true, 100), true);
  assert.equal(shouldNavigateWheelEvent(true, false, 4), false);
  assert.equal(shouldNavigateWheelEvent(true, false, 8), true);
  assert.equal(shouldNavigateWheelEvent(true, true, 30), false);
});

test("clamps percentage reveal zones for very small and large viewports", () => {
  assert.equal(getClampedEdgeSize(320, 0.05, 24, 96), 24);
  assert.equal(getClampedEdgeSize(1000, 0.05, 24, 96), 50);
  assert.equal(getClampedEdgeSize(4000, 0.05, 24, 96), 96);
});

test("compensates zoom translation around the focal point", () => {
  assert.equal(getZoomTranslationDelta(2, 75, 50), -25);
  assert.equal(getZoomTranslationDelta(0.5, 75, 50), 12.5);
  assert.equal(Math.abs(getZoomTranslationDelta(2, 50, 50)), 0);
});
