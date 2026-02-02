import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

function toValidDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar,
  Users,
  FileText,
  GraduationCap,
  Briefcase,
  DollarSign,
  ClipboardList,
  Files,
  Sparkles,
  Star
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ParticipantQuickNotes from '@/components/participant-detail/ParticipantQuickNotes.jsx';

export default function ParticipantOverview({ participant }) {
    const { data: caseWorker } = useQuery({
    queryKey: ['caseWorker', participant.primary_case_worker_id],
    queryFn: () =>
      participant.primary_case_worker_id
        ? base44.entities.User.get(participant.primary_case_worker_id)
        : null,
    enabled: !!participant.primary_case_worker_id,
  });


  const { data: caseNotes = [] } = useQuery({
    queryKey: ['participantCaseNotes', participant.id],
    queryFn: async () => {
      const notes = await base44.entities.CaseNote.list('-created_date', 500);
      return notes.filter(n => n.linked_participant_ids?.includes(participant.id));
    },
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ['participantTrainings', participant.id],
    queryFn: () => base44.entities.ParticipantTraining.filter({ participant_id: participant.id }),
  });

  const { data: employments = [] } = useQuery({
    queryKey: ['participantEmployments', participant.id],
    queryFn: () => base44.entities.EmploymentPlacement.filter({ participant_id: participant.id }),
  });

  const { data: funding = [] } = useQuery({
    queryKey: ['participantFunding', participant.id],
    queryFn: async () => {
      const records = await base44.entities.FundingRecord.list('-created_date', 500);
      return records.filter(r => r.linked_participant_ids?.includes(participant.id));
    },
  });

  const { data: surveys = [] } = useQuery({
    queryKey: ['participantSurveys', participant.id],
    queryFn: () => base44.entities.SurveyResponse.filter({ participant_id: participant.id }),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['participantDocuments', participant.id],
    queryFn: () => base44.entities.Document.filter({ linked_participant_id: participant.id }),
  });

  const { data: goodNewsStories = [] } = useQuery({
    queryKey: ['participantGoodNewsStories', participant.id],
    queryFn: () => base44.entities.GoodNewsStory.filter({ participant_id: participant.id }),
  });

  const InfoCard = ({ title, children }) => (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );

  const InfoRow = ({ label, value, icon: Icon }) => (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 text-slate-500 mt-0.5" />}
      <div className="flex-1">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-white font-medium">{value || '—'}</p>
      </div>
    </div>
  );

  const StatBox = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Activity Snapshot */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Activity Snapshot</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBox icon={FileText} label="Case Notes" value={caseNotes.length} color="bg-violet-500" />
          <StatBox icon={GraduationCap} label="Training" value={trainings.length} color="bg-amber-500" />
          <StatBox icon={Briefcase} label="Employment" value={employments.length} color="bg-emerald-500" />
          <StatBox icon={DollarSign} label="Funding" value={funding.length} color="bg-pink-500" />
          <StatBox icon={ClipboardList} label="Surveys" value={surveys.length} color="bg-blue-500" />
          <StatBox icon={Files} label="Documents" value={documents.length} color="bg-cyan-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Personal Information */}
      <InfoCard title="Personal Information">
        <div className="space-y-1 divide-y divide-slate-800/50">
          <InfoRow 
            label="Full Name" 
            value={`${participant.first_name} ${participant.last_name}`}
            icon={User}
          />
          <InfoRow 
            label="Date of Birth" 
            value={(() => { const d = toValidDate(participant?.date_of_birth); return d ? format(d, 'MMMM d, yyyy') : null; })()}
            icon={Calendar}
          />
          <InfoRow label="Gender" value={participant.gender} />
          <InfoRow label="Indigenous Status" value={participant.indigenous_status} />
        </div>
      </InfoCard>

      {/* Contact Information */}
      <InfoCard title="Contact Information">
        <div className="space-y-1 divide-y divide-slate-800/50">
          <InfoRow label="Email" value={participant.contact_email} icon={Mail} />
          <InfoRow label="Phone" value={participant.contact_phone} icon={Phone} />
          <InfoRow 
            label="Address" 
            value={[
              participant.address_line1,
              participant.address_line2,
              participant.suburb && `${participant.suburb}, ${participant.state} ${participant.postcode}`
            ].filter(Boolean).join('\n') || null}
            icon={MapPin}
          />
        </div>
      </InfoCard>

      {/* Emergency Contact */}
      <InfoCard title="Emergency Contact">
        <div className="space-y-1 divide-y divide-slate-800/50">
          <InfoRow 
            label="Name" 
            value={participant.emergency_contact_name}
            icon={User}
          />
          <InfoRow 
            label="Phone" 
            value={participant.emergency_contact_phone}
            icon={Phone}
          />
        </div>
      </InfoCard>
              {/* Case Management */}
              <InfoCard title="Case Management">
                  <div className="space-y-1 divide-y divide-slate-800/50">
                      <InfoRow
                          label="Primary Case Worker"
                          value={caseWorker?.full_name}
                          icon={Users}
                      />
                      <InfoRow label="Current Phase" value={participant.current_phase} />
                      <InfoRow label="Status" value={participant.status} />
                      <InfoRow
                          label="Created"
                          value={(() => { const d = toValidDate(participant?.created_date); return d ? format(d, 'MMMM d, yyyy') : null; })()}
                          icon={Calendar}
                      />
                  </div>
              </InfoCard>
          </div>
      {/* Quick Notes */}
      <InfoCard title="Quick Notes">
                  <ParticipantQuickNotes participantId={participant?.id} />
      </InfoCard>


      

     
    </div>
  );
}