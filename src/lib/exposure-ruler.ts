import { exposureValue } from "./camera-settings";

export const rulerSpacing = 18;
export function exposureAtOffset(
  offset: number,
  min: number,
  max: number,
  step: number
) {
  return exposureValue(
    min + Math.round(offset / rulerSpacing) * step,
    min,
    max,
    step
  );
}
export function exposureOffset(
  value: number,
  min: number,
  max: number,
  step: number
) {
  return (
    Math.round((exposureValue(value, min, max, step) - min) / step) *
    rulerSpacing
  );
}
