import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMessages } from "./clubs.functions";
import { readTime } from "./unread";

export function UnreadBadge({ clubId, deviceToken }: { clubId: string; deviceToken: string }) {
  const fetchMessages = useServerFn(listMessages);
  const query = useQuery({
    queryKey: ["club-messages", clubId, deviceToken],
    queryFn: () => fetchMessages({ data: { clubId, deviceToken } }),
    refetchInterval: 10000,
  });
  const count = query.data?.ok
    ? query.data.messages.filter(
        (message) => !message.mine && message.createdAt > readTime(clubId, deviceToken),
      ).length
    : 0;
  return count ? (
    <span
      aria-label={`${count} unread messages`}
      className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
    >
      {count > 99 ? "99+" : count} new
    </span>
  ) : null;
}
