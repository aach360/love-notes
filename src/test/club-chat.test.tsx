import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ clubId: "club" }),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/modules/clubs/useClubDevice", () => ({
  useClubDevice: () => ({
    device: { deviceToken: "device-token" },
    memberships: [{ clubId: "club", memberId: "me", displayName: "Me", joinCode: "ABCDEF" }],
    refreshMemberships: vi.fn(),
  }),
}));
vi.mock("@/modules/clubs/ClubIMessage", () => ({ ClubIMessage: () => null }));
vi.mock("@/modules/clubs/clubs.functions", () => ({
  listClubs: vi.fn(),
  listMessages: vi.fn(),
  postMessage: vi.fn(),
  leaveClub: vi.fn(),
}));
vi.mock("@/modules/ingestion/events.functions", () => ({
  eventsQuery: { queryKey: ["events"], queryFn: vi.fn() },
}));

import { Route } from "@/routes/clubs.$clubId";

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  vi.restoreAllMocks();
});

it("keeps club chat mounted when incoming messages update and scrolling returns a promise", async () => {
  const scroll = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["clubs"], [{ id: "club", name: "Test club", memberCount: 2 }]);
  client.setQueryData(["events"], { events: [] });
  const key = ["club-messages", "club", "device-token"];
  client.setQueryData(key, { ok: true, messages: [] });
  const ClubChat = Route.options.component!;
  const view = render(
    <QueryClientProvider client={client}>
      <ClubChat />
    </QueryClientProvider>,
  );
  const messages = [
    {
      id: "message-1",
      memberId: "other",
      displayName: "Other",
      body: "Hello from another account",
      createdAt: new Date().toISOString(),
    },
  ];
  await act(async () => {
    client.setQueryData(key, { ok: true, messages });
  });
  expect(await screen.findByText("Hello from another account")).toBeInTheDocument();
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(() => view.unmount()).not.toThrow();
  client.clear();
});
