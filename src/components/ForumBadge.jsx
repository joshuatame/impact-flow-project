import React from "react";
import { useForumUnreadCount } from "@/components/forum/useForumUnreadCount";

export default function ForumBadge() {
  const { totalUnread } = useForumUnreadCount();

  if (!totalUnread) return null;

  return (
    <span className="ml-auto bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
      {totalUnread > 9 ? "9+" : totalUnread}
    </span>
  );
}
