import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PrimaryNavigation } from "../../app/components/PrimaryNavigation.tsx";

describe("primary navigation behavior", () => {
  it("routes locked and unlocked tab clicks through different callbacks", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onLockedActivate = vi.fn();
    const lockedAvailability = {
      tab: "releases" as const,
      unlocked: false as const,
      unlockDay: 10,
      reason: "인수인계 후 공개됩니다.",
    };
    const { rerender } = render(
      <PrimaryNavigation
        activeTab="distribution"
        disabled={false}
        hasBusinessEvent={false}
        onActivate={onActivate}
        onLockedActivate={onLockedActivate}
        onReturnToTitle={() => undefined}
        phase="running"
        tabAvailability={{ releases: lockedAvailability }}
      />,
    );

    const releases = screen.getByRole("button", { name: /발매/ });
    expect(releases.getAttribute("aria-disabled")).toBe("true");
    expect(releases.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("인수인계 후 공개됩니다.")).toBeTruthy();
    await user.click(releases);
    expect(onLockedActivate).toHaveBeenCalledWith("releases", lockedAvailability);
    expect(onActivate).not.toHaveBeenCalled();

    rerender(
      <PrimaryNavigation
        activeTab="distribution"
        attentionTabs={["releases"]}
        disabled={false}
        hasBusinessEvent={false}
        onActivate={onActivate}
        onLockedActivate={onLockedActivate}
        onReturnToTitle={() => undefined}
        phase="running"
        tabAvailability={{
          releases: {
            tab: "releases",
            unlocked: true,
            unlockDay: 10,
            reason: null,
          },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /발매/ }));
    expect(onActivate).toHaveBeenCalledWith("releases");
    expect(screen.getByRole("button", { name: /발매/ }).querySelector(".nav-alert:not(.is-placeholder)"))
      .toBeTruthy();
  });
});
