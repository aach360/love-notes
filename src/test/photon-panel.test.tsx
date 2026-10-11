import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { PhotonConnection } from "@/shared/types";
const mock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  availability: vi.fn(),
  connection: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({ user: mock.user, ready: true }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/modules/assistant/messaging/messaging.functions", () => ({
  getPhotonAvailability: mock.availability,
  getPhotonConnection: mock.connection,
  createPhotonLink: mock.create,
  updatePhotonConnection: mock.update,
}));
import { PhotonPanel } from "@/modules/assistant/messaging/PhotonPanel";
const status: PhotonConnection = {
  status: "online",
  botAddress: "bot@example.test",
  link: null,
  unknownDeliveries: 0,
};
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <PhotonPanel />
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mock.user = null;
  mock.availability.mockResolvedValue({ ...status, status: "unconfigured" });
  mock.connection.mockResolvedValue(status);
  mock.update.mockResolvedValue({ ok: true });
});
describe("Photon connection panel", () => {
  it("renders safely when signed out and does not claim unconfigured messaging works", async () => {
    mount();
    expect(await screen.findByText("iMessage is not set up yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to connect your plan" })).toBeInTheDocument();
    expect(mock.connection).not.toHaveBeenCalled();
  });
  it("requires browser confirmation without preselecting reminder consent", async () => {
    mock.user = { id: "account" };
    mock.connection.mockResolvedValue({
      ...status,
      link: {
        id: "contact",
        sender: "student@example.test",
        pending: true,
        remindersEnabled: false,
        leadMinutes: 30,
        suppressed: false,
      },
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm my connection" }));
    await waitFor(() =>
      expect(mock.update).toHaveBeenCalledWith({
        data: { action: "confirm", contactId: "contact" },
      }),
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("persists an explicit reminder opt-in on the server", async () => {
    mock.user = { id: "account" };
    mock.connection.mockResolvedValue({
      ...status,
      link: {
        id: "contact",
        sender: "student@example.test",
        pending: false,
        remindersEnabled: false,
        leadMinutes: 30,
        suppressed: false,
      },
    });
    mount();
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(mock.update).toHaveBeenCalledWith({
        data: { action: "preferences", enabled: true, leadMinutes: 30 },
      }),
    );
  });
  it("shows suppression instead of an active reminders switch", async () => {
    mock.user = { id: "account" };
    mock.connection.mockResolvedValue({
      ...status,
      link: {
        id: "contact",
        sender: "student@example.test",
        pending: false,
        remindersEnabled: false,
        leadMinutes: 30,
        suppressed: true,
      },
    });
    mount();
    expect(await screen.findByText(/Texts are stopped/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
