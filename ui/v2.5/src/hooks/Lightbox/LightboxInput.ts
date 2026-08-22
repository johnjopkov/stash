const DOM_DELTA_PIXEL = 0;

export const CONTINUOUS_WHEEL_DELTA_THRESHOLD = 10;
export const CONTINUOUS_WHEEL_NAVIGATION_THRESHOLD = 8;

export function getClampedEdgeSize(
  size: number,
  ratio: number,
  minimum: number,
  maximum: number
) {
  return Math.min(maximum, Math.max(minimum, size * ratio));
}

export function getZoomTranslationDelta(
  scaleRatio: number,
  focalPoint: number,
  currentCenter: number
) {
  return (1 - scaleRatio) * (focalPoint - currentCenter);
}

/**
 * Browsers do not expose whether a wheel event came from a mouse wheel or a
 * touchpad. Classify the event stream by its shape instead: line/page deltas
 * and large pixel deltas are discrete, while the small pixel deltas emitted at
 * the start of a touchpad or free-spin gesture are continuous.
 */
export function isContinuousWheelEvent(
  deltaY: number,
  deltaMode: number,
  firstDeltaY: number | null
) {
  if (deltaMode !== DOM_DELTA_PIXEL) return false;

  return (
    Math.abs(deltaY) < CONTINUOUS_WHEEL_DELTA_THRESHOLD ||
    (firstDeltaY !== null &&
      Math.abs(firstDeltaY) < CONTINUOUS_WHEEL_DELTA_THRESHOLD)
  );
}

export function shouldNavigateWheelEvent(
  continuous: boolean,
  gestureAlreadyHandled: boolean,
  deltaY: number
) {
  return (
    !continuous ||
    (!gestureAlreadyHandled &&
      Math.abs(deltaY) >= CONTINUOUS_WHEEL_NAVIGATION_THRESHOLD)
  );
}
