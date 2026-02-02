import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell } from 'lucide-react';

export default function ApprovalBadge() {
  const { data: requests = [] } = useQuery({
    queryKey: ['workflowRequests'],
    queryFn: () => base44.entities.WorkflowRequest.list('-created_date', 100),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  if (pendingCount === 0) return null;

  return (
    <Link 
      to={createPageUrl('WorkflowApprovals')}
      className="relative p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
    >
      <Bell className="h-5 w-5 text-slate-400" />
      <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
        {pendingCount > 9 ? '9+' : pendingCount}
      </span>
    </Link>
  );
}