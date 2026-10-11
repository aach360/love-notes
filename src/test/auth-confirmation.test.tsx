import { StrictMode, type ComponentType } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/modules/auth/auth.functions", () => ({ checkGoogleSignIn: vi.fn() }));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { verifyOtp: mocks.verify } },
}));
import { Route } from "@/routes/auth";
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  mocks.verify.mockReset();
  mocks.navigate.mockReset();
  window.history.replaceState(null, "", "/auth?token_hash=test-confirmation&type=email");
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
describe("email confirmation callback", () => {
  it("verifies once under StrictMode, removes the token and returns to Discover", async () => {
    mocks.verify.mockResolvedValue({ error: null });
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: "test-confirmation", type: "email" });
    expect(window.location.search).toBe("");
  });
  it("keeps an expired link on the account page with recovery instructions", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "expired" } });
    render(<Page />);
    expect(await screen.findByRole("alert")).toHaveTextContent("request a new confirmation");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeDisabled();
  });
});
