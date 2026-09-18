import { WORDMARK_ADVANCE_EM } from './mark-glyphs';

/**
 * Construction of the ClearAF mark (spec §10.2–10.5). H is the frame's outer height; every measure derives from it.
 * Mirrors ClearAF/Views/Brand/LetterpressMarkGeometry.swift; tests/brand-mark.test.ts keeps the two identical.
 */
export const MARK = {
  aspect: 0.8,
  monogramRatio: 0.39,
  rightInsetRatio: 0.19,
  bottomInsetRatio: 0.08,
  cornerRadius: 0,
  hairline: 0.75,
  midBandMaximum: 1.5,
  blockBelowHeight: 16,
  blockSideRatio: 0.31,
  blockRightInsetRatio: 0.1,
  clearSpaceRatio: 0.5,
  lockupGapRatio: 0.4,
  wordmarkSizeRatio: 0.78,
  wordmarkTrackingEm: 0.18,
  lockupMinimumWidth: 96,
  iconFrameRatio: 0.52,
  iconLiftRatio: 0.015,
} as const;

export type MarkLayout = {
  width: number;
  height: number;
  stroke: number;
  monogramSize: number;
  /** Bottom-right of the monogram's line box, from the frame's top-left. */
  anchor: { x: number; y: number };
  /** Solid block that replaces the letters below the favicon floor; null when the letters are drawn. */
  block: { x: number; y: number; side: number } | null;
};

export function markStroke(height: number): number {
  if (height >= 48) return 0.028 * height;
  if (height >= 24) return Math.min(0.05 * height, MARK.midBandMaximum);
  return MARK.hairline;
}

export function markLayout(height: number): MarkLayout {
  const width = MARK.aspect * height;
  const stroke = markStroke(height);
  const bottom = height - stroke - MARK.bottomInsetRatio * height;
  const side = MARK.blockSideRatio * height;
  return {
    width,
    height,
    stroke,
    monogramSize: MARK.monogramRatio * height,
    anchor: { x: width - stroke - MARK.rightInsetRatio * width, y: bottom },
    block: height < MARK.blockBelowHeight ? { x: width - stroke - MARK.blockRightInsetRatio * width - side, y: bottom - side, side } : null,
  };
}

export const clearSpace = (height: number): number => MARK.clearSpaceRatio * height;
export const lockupGap = (height: number): number => MARK.lockupGapRatio * height;
export const wordmarkSize = (height: number): number => MARK.wordmarkSizeRatio * height;

/** Natural width of mark + gap + tracked wordmark (tracking follows each of the 7 letters, as CSS applies it). */
export function lockupWidth(height: number): number {
  return MARK.aspect * height + lockupGap(height) + wordmarkSize(height) * (WORDMARK_ADVANCE_EM + 7 * MARK.wordmarkTrackingEm);
}

/** Spec §10.3: below 96px wide the lockup drops to the mark alone. */
export const showsWordmark = (height: number): boolean => lockupWidth(height) >= MARK.lockupMinimumWidth;

/** Rounds for stable SVG markup. */
export const svgNumber = (value: number): string => String(Math.round(value * 1000) / 1000);

/** Frame heights where the lockup is placed (spec §10.6). */
export const LOCKUP_HEIGHT = { rail: 25, signIn: 27 } as const;
