import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

function byDateDesc(a, b) {
  return String(b?.activity_date || b?.created_date || '').localeCompare(String(a?.activity_date || a?.created_date || ''));
}

export default function ParticipantDex({ participantId }) {
  const { data: dexActivities = [], isLoading } = useQuery({
    queryKey: ['dexActivities', participantId],
    queryFn: () => base44.entities.DEXActivityRecord.filter({ participant_id: participantId }),
  });

  if (isLoading) return <LoadingSpinner />;

  const items = Array.isArray(dexActivities) ? [...dexActivities].sort(byDateDesc) : [];

  if (!items.length) {
    return (
      <EmptyState
        title="No DEX sessions"
        description="No DEX sessions have been recorded for this participant yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((d) => (
        <Card key={d.id} className="bg-slate-900/50 border-slate-800 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-white font-medium truncate">{d.activity_type || 'DEX Session'}</div>
              <div className="text-xs text-slate-400 mt-1">
                {d.activity_date || d.created_date || ''}
                {d.case_location ? ` • ${d.case_location}` : ''}
                {d.service_setting ? ` • ${d.service_setting}` : ''}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
