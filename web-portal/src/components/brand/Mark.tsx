import * as React from 'react';
import { markLayout, svgNumber as n } from './geometry';
import { MARK_GLYPH_PATH } from './mark-glyphs';

type MarkProps = {
  /** Frame height in px (H). */
  height: number;
  /** Accessible name; omit when a visible or screen-reader label sits beside the mark. */
  title?: string;
  className?: string;
};

/**
 * The ClearAF mark (spec §10): a 4:5 frame with the italic "af" tucked bottom-right, one colour (currentColor).
 * The letters are outline paths generated from Newsreader Light Italic, so they never fall back to another font.
 */
export function Mark({ height, title, className }: MarkProps): React.JSX.Element {
  const { width, stroke: s, monogramSize, anchor, block } = markLayout(height);
  const ring = `M0 0H${n(width)}V${n(height)}H0ZM${n(s)} ${n(s)}H${n(width - s)}V${n(height - s)}H${n(s)}Z`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={n(width)}
      height={n(height)}
      viewBox={`0 0 ${n(width)} ${n(height)}`}
      fill="currentColor"
      focusable="false"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      data-mark-height={height}
    >
      <path fillRule="evenodd" d={ring} />
      {block ? (
        <rect x={n(block.x)} y={n(block.y)} width={n(block.side)} height={n(block.side)} />
      ) : (
        <path d={MARK_GLYPH_PATH} transform={`translate(${n(anchor.x)} ${n(anchor.y)}) scale(${n(monogramSize)})`} />
      )}
    </svg>
  );
}
