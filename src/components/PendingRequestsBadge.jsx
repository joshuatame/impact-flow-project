import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function PendingRequestsBadge() {
  const { data: requests = [] } = useQuery({
    queryKey: ['workflowRequests'],
    queryFn: () => base44.entities.WorkflowRequest.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  if (pendingCount === 0) return null;

  return (
    <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
      {pendingCount > 9 ? '9+' : pendingCount}
    </span>
  );
}