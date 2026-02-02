import React from 'react';
import { format, differenceInDays, parseISO, isAfter, isBefore } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';

export default function ProgramTimelineBar({ program }) {
  if (!program?.start_date) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 text-center">
        <p className="text-slate-500 text-sm">No program dates set</p>
      </div>
    );
  }

  const startDate = parseISO(program.start_date);
  const endDate = program.end_date ? parseISO(program.end_date) : null;
  const today = new Date();

  // Calculate progress
  let progressPercent = 0;
  let daysRemaining = null;
  let totalDays = null;
  let daysElapsed = null;
  let status = 'upcoming';

  if (endDate) {
    totalDays = differenceInDays(endDate, startDate);
    daysElapsed = differenceInDays(today, startDate);
    daysRemaining = differenceInDays(endDate, today);

    if (isBefore(today, startDate)) {
      status = 'upcoming';
      progressPercent = 0;
    } else if (isAfter(today, endDate)) {
      status = 'completed';
      progressPercent = 100;
    } else {
      status = 'active';
      progressPercent = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
    }
  } else {
    daysElapsed = differenceInDays(today, startDate);
    if (isBefore(today, startDate)) {
      status = 'upcoming';
    } else {
      status = 'active';
      progressPercent = 50; // No end date, show as ongoing
    }
  }

  const statusColors = {
    upcoming: 'from-amber-500 to-orange-500',
    active: 'from-blue-500 to-cyan-500',
    completed: 'from-emerald-500 to-green-500'
  };

  const statusLabels = {
    upcoming: 'Upcoming',
    active: 'In Progress',
    completed: 'Completed'
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${statusColors[status]}`}>
            <Clock className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Program Timeline</h3>
            <p className="text-sm text-slate-400">{statusLabels[status]}</p>
          </div>
        </div>
        {status === 'active' && daysRemaining !== null && daysRemaining > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{daysRemaining}</p>
            <p className="text-xs text-slate-400">days remaining</p>
          </div>
        )}
      </div>

      {/* Timeline Bar */}
      <div className="relative mt-6 mb-4">
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${statusColors[status]} transition-all duration-500`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        {/* Today marker */}
        {status === 'active' && (
          <div 
            className="absolute top-0 -translate-y-1 w-1 h-5 bg-white rounded-full shadow-lg"
            style={{ left: `${progressPercent}%` }}
          />
        )}
      </div>

      {/* Date labels */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Calendar className="h-4 w-4" />
          <span>{format(startDate, 'MMM d, yyyy')}</span>
        </div>
        {endDate && (
          <div className="flex items-center gap-2 text-slate-400">
            <span>{format(endDate, 'MMM d, yyyy')}</span>
            <Calendar className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Progress stats */}
      {totalDays && (
        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-800">
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{totalDays}</p>
            <p className="text-xs text-slate-500">Total Days</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-blue-400">{Math.max(0, daysElapsed)}</p>
            <p className="text-xs text-slate-500">Days Elapsed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-emerald-400">{progressPercent.toFixed(0)}%</p>
            <p className="text-xs text-slate-500">Complete</p>
          </div>
        </div>
      )}
    </div>
  );
}