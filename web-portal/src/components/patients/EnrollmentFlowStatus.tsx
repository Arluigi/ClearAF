import * as React from 'react';
import type {LaunchEnrollmentResponse, LaunchCatalog} from '../../types/api';
/** Payment and identity review can precede the completed clinical package. */
export function EnrollmentFlowStatus({enrollment,catalog}:{enrollment:LaunchEnrollmentResponse;catalog?:LaunchCatalog|null}) {
  const record=enrollment.case;
  if(record.questionnaireVersion!=='2.2-pending-review')return null;
  const inProgress=!['submitted','approved','rejected','ineligible'].includes(record.status);
  const topic=record.enrollmentProgress?.topicId;
  const topicTitle=catalog?.enrollmentFlow?.medicalSections.find(section=>section.id===topic)?.title;
  const savedStep=topicTitle??(topic?topic.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase()):record.status.replaceAll('_',' '));
  return <section aria-label="Enrollment progress" className="space-y-2 border-t border-rule pt-4 text-sm">
    <h3 className="font-medium">{inProgress?'Enrollment in progress':'Enrollment package'}</h3>
    {inProgress&&<p>Saved step: {savedStep}. The patient can return to continue enrollment.</p>}
    {enrollment.membership?.status==='paid_pending_review'&&<p>Payment received. Care starts after identity and clinical approval.</p>}
    <p>{!record.identity?'Identity has not been submitted.':record.identity.status==='uploaded'?'Identity awaiting manual review.':`Identity ${record.identity.status.replaceAll('_',' ')}.`}</p>
    {inProgress&&<p>Identity can be reviewed now. Clinical approval requires a complete submitted package and approved identity.</p>}
  </section>;
}
