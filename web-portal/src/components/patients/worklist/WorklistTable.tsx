import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { activity, day, isWaiting, plural, rowAction, waited } from '@/lib/worklist';
import type { WorklistResponse } from '@/types/api';
import AdherenceSparkline from './AdherenceSparkline';
import DataText from './DataText';

// Spec §4.9: one ruled table merging the review queue and the patient list. Waiting rows carry data-attention
// (rail fill + 4px attention.mark bar, from PR 2's TableRow); every row has exactly one filled action.
export default function WorklistTable({ result, context, now }: { result: WorklistResponse; context: string; now: Date }) {
  return (
    <Table aria-label="Worklist patients">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Patient</TableHead>
          <TableHead>Waiting</TableHead>
          <TableHead>Last 14 days</TableHead>
          <TableHead>Latest activity</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.data.map((row) => {
          const action = rowAction(result.filter, row, context);
          return (
            <TableRow key={row.patientId} data-attention={isWaiting(row) ? 'true' : undefined}>
              <TableCell className="pl-4">
                <p className="text-[15px] font-medium text-ink">{row.name || 'Unnamed patient'}</p>
                <p className="font-data text-[11px] uppercase tabular-nums text-ink-tertiary">{`Since ${day(row.joinedAt)}`}</p>
              </TableCell>
              <TableCell>
                {row.photos.unreviewedCount > 0 && row.photos.oldestUploadAt ? (
                  <>
                    <p className="font-data text-sm font-medium tabular-nums text-ink">{plural(row.photos.unreviewedCount, 'photo')}</p>
                    <p className="font-data text-[11px] uppercase tabular-nums text-ink-tertiary">{`Oldest ${waited(row.photos.oldestUploadAt, now)}`}</p>
                  </>
                ) : (
                  <p className="text-xs text-ink-secondary">No photos waiting</p>
                )}
              </TableCell>
              <TableCell><AdherenceSparkline adherence={row.adherence} /></TableCell>
              <TableCell>{activity(row).map((line) => <p key={line} className="text-xs text-ink-secondary"><DataText text={line} /></p>)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" asChild><a href={action.href} aria-label={action.ariaLabel}>{action.label}</a></Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
