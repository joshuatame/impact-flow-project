import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, Mail, MapPin } from 'lucide-react';

const phaseColors = {
  'Pre Employment Support': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Training Commenced': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Training Engagement': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Training Completed': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Employment Commenced': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Employment Engagement': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Employment Sustained': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Mentoring': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'Exit': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  // Legacy phases for backward compatibility
  'Training': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Employment': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const statusColors = {
  'Active': 'bg-emerald-500/10 text-emerald-400',
  'Inactive': 'bg-slate-500/10 text-slate-400',
  'Completed': 'bg-blue-500/10 text-blue-400',
  'Withdrawn': 'bg-red-500/10 text-red-400',
};

export default function ParticipantCard({ participant }) {
  const getInitials = (first, last) => {
    return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
  };

  return (
    <Link
      to={createPageUrl(`ParticipantDetail?id=${participant.id}`)}
      className="block bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 hover:border-slate-700/50 transition-all hover:shadow-lg hover:shadow-slate-900/20"
    >
      <div className="flex items-start gap-4">
        <Avatar className="h-12 w-12 rounded-xl">
          {participant.profile_image_url && (
            <AvatarImage src={participant.profile_image_url} />
          )}
          <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white font-semibold">
            {getInitials(participant.first_name, participant.last_name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">
            {participant.first_name} {participant.last_name}
          </h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={phaseColors[participant.current_phase] || phaseColors['Pre Employment Support']}>
              {participant.current_phase}
            </Badge>
            <Badge className={statusColors[participant.status] || statusColors['Active']}>
              {participant.status}
            </Badge>
            {participant.dex_reportable && (
              <Badge className="bg-violet-500/10 text-violet-400 text-xs">DEX</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {participant.contact_phone && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Phone className="h-3.5 w-3.5" />
            <span className="truncate">{participant.contact_phone}</span>
          </div>
        )}
        {participant.contact_email && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{participant.contact_email}</span>
          </div>
        )}
        {participant.suburb && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin className="h-3.5 w-3.5" />
            <span>{participant.suburb}, {participant.state}</span>
          </div>
        )}
      </div>
    </Link>
  );
}