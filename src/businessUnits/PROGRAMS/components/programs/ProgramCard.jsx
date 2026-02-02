import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Calendar,
  DollarSign,
  Users,
  ChevronRight,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';

const statusColors = {
  'Active': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Inactive': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'Completed': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export default function ProgramCard({ program, participantCount = 0, totalSpent = 0, className }) {
  const budgetUsed = program.total_funding_amount > 0 
    ? (totalSpent / program.total_funding_amount) * 100 
    : 0;

  return (
    <Link
      to={createPageUrl(`ProgramDetail?id=${program.id}`)}
      className={cn(
        "block bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6",
        "hover:border-slate-700/50 hover:bg-slate-900/80 transition-all duration-300",
        "group",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg group-hover:text-blue-400 transition-colors">
                {program.program_name}
              </h3>
              <p className="text-sm text-slate-500">{program.contract_code}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className={cn("text-xs", statusColors[program.status])}>
              {program.status}
            </Badge>
            {program.dex_reporting_required && (
              <Badge className="bg-violet-500/10 text-violet-400 text-xs">
                DEX Required
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500 mb-1">Funder</p>
              <p className="text-white font-medium">{program.funder_name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-1">Participants</p>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-white font-medium">{participantCount}</span>
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-slate-500 mb-1">Duration</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="text-white text-xs">
                  {program.start_date ? format(new Date(program.start_date), 'MMM yyyy') : '—'} 
                  {' - '}
                  {program.end_date ? format(new Date(program.end_date), 'MMM yyyy') : 'Ongoing'}
                </span>
              </div>
            </div>
          </div>

          {program.total_funding_amount > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Budget Used</span>
                <span className="text-sm font-medium text-white">
                  ${totalSpent.toLocaleString()} / ${program.total_funding_amount.toLocaleString()}
                </span>
              </div>
              <Progress value={budgetUsed} className="h-2 bg-slate-800" />
            </div>
          )}
        </div>

        <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-2" />
      </div>
    </Link>
  );
}