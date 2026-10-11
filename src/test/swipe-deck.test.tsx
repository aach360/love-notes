import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import type { RankedEvent } from "@/shared/types";

function card(id: string): RankedEvent {
  return { score: 0, reason: null, event: {
    id, source: "demo", sourceEventId: id, sourceUrl: "https://example.com/event",
    title: `Event ${id}`, description: `Description ${id}`, startsAt: "2026-10-15T18:00:00-04:00",
    endsAt: null, timezone: "America/New_York", location: null, organizer: null,
    imageUrl: null, categories: [], tags: [], costAmount: null, costText: null,
    eligibility: null, status: "scheduled", lastFetchedAt: "2026-10-11T00:00:00Z", isDemo: true,
  } };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SwipeDeck identity and lifecycle", () => {
  it("pins the whole visible card across refreshes, including details", () => {
    const onSwipe = vi.fn();
    const a = card("a"), b = card("b");
    const props = { onSwipe, onUndo: vi.fn(), canUndo: false };
    const view = render(<SwipeDeck ranked={[a, b]} {...props} />);
    view.rerender(<SwipeDeck ranked={[b, { ...a, event: { ...a.event, title: "Refreshed title" } }]} {...props} />);
    expect(screen.getByRole("heading", { name: "Event a" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Description a");
    view.rerender(<SwipeDeck ranked={[b]} {...props} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Event a");
    expect(onSwipe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close details" })).toBeInTheDocument();
  });

  it("records once and waits for fresh ranking before entering the next card", () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const a = card("a"), b = card("b"), c = card("c");
    const props = { onSwipe, onUndo: vi.fn(), canUndo: false };
    const view = render(<SwipeDeck ranked={[a, b]} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save (right arrow)" }));
    view.rerender(<SwipeDeck ranked={[c, a, b]} {...props} />);
    expect(screen.getByRole("heading", { name: "Event a" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith(a.event, "like", a);
    expect(view.container.querySelector('[data-phase="settling"]')).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Event c" })).not.toBeInTheDocument();
    view.rerender(<SwipeDeck ranked={[b, c]} {...props} />);
    expect(screen.getByRole("heading", { name: "Event b" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(view.container.querySelector('[data-phase="idle"]')).toBeInTheDocument();
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it("opens on ArrowUp without feedback and blocks swipes while details are open", () => {
    const onSwipe = vi.fn();
    render(<SwipeDeck ranked={[card("a"), card("b")]} onSwipe={onSwipe} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(screen.getByRole("dialog")).toHaveTextContent("Event a");
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(onSwipe).not.toHaveBeenCalled();
  });
});