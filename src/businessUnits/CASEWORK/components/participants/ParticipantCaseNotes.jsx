import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  Plus, 
  FileText, 
  Calendar,
  Clock,
  User,
  Lock,
  MapPin,
  FolderKanban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/ui/EmptyState.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

const noteTypeColours = {
  'Contact': 'bg-blue-500/10 text-blue-400',
  'Session': 'bg-emerald-500/10 text-emerald-400',
  'Phone': 'bg-amber-500/10 text-amber-400',
  'Email': 'bg-violet-500/10 text-violet-400',
  'Outreach': 'bg-pink-500/10 text-pink-400',
  'Other': 'bg-slate-500/10 text-slate-400',
};

export default function ParticipantCaseNotes({ participantId }) {
  const { data: caseNotes = [], isLoading } = useQuery({
    queryKey: ['caseNotes', participantId],
    queryFn: async () => {
      const notes = await base44.entities.CaseNote.list('-interaction_date', 500);
      return notes.filter(note => 
        note.linked_participant_ids?.includes(participantId)
      );
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Case Notes</h3>
        <Link to={createPageUrl(`CaseNoteForm?participant_id=${participantId}`)}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Case Note
          </Button>
        </Link>
      </div>

      {caseNotes.length > 0 ? (
        <div className="space-y-4">
          {caseNotes.map(note => (
            <Link
              key={note.id}
              to={createPageUrl(`CaseNoteDetail?id=${note.id}`)}
              className="block bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 hover:border-slate-700/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-slate-800">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-white">{note.title}</h4>
                      {note.sensitivity_level === 'Sensitive' && (
                        <Lock className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge className={noteTypeColours[note.note_type]}>
                        {note.note_type}
                      </Badge>
                      {note.is_billable_for_dex && (
                        <Badge className="bg-violet-500/10 text-violet-400">DEX Billable</Badge>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mt-3 line-clamp-2">
                      {note.narrative_text}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-500">
                      {note.interaction_date && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(note.interaction_date), 'MMM d, yyyy')}
                        </div>
                      )}
                      {note.duration_minutes && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {note.duration_minutes} min
                        </div>
                      )}
                      {note.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {note.location}
                        </div>
                      )}
                      {note.author_name && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {note.author_name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No case notes"
          description="Add your first case note for this participant"
          actionLabel="Add Case Note"
          onAction={() => window.location.href = createPageUrl(`CaseNoteForm?participant_id=${participantId}`)}
        />
      )}
    </div>
  );
}