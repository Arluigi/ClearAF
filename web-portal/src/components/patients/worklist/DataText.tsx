import * as React from 'react';
import { dataSegments } from '@/lib/worklist';

// Spec §4.9: dates, times and counts inside a prose line render in mono tabular figures; the
// surrounding words stay in the UI font. See `dataSegments` for what counts as "data".
export default function DataText({ text }: { text: string }) {
  return (
    <>
      {dataSegments(text).map((segment, index) =>
        segment.data ? (
          <span key={index} className="font-data tabular-nums">{segment.text}</span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}
