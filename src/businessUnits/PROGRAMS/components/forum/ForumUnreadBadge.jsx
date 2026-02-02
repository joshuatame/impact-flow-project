import React from "react";
import { Badge } from "@/components/ui/badge";
import { useForumUnreadCount } from "@/components/forum/useForumUnreadCount";

export default function ForumUnreadBadge() {
  const { totalUnread } = useForumUnreadCount();

  if (!totalUnread) return null;

  return (
    <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
      {totalUnread > 99 ? "99+" : totalUnread}
    </Badge>
  );
}
