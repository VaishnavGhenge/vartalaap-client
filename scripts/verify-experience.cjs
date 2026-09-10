const { chromium, expect } = require("@playwright/test");
const path = require("node:path");
const os = require("node:os");

const baseURL = process.env.UI_BASE_URL || "http://localhost:3000";
const output = process.env.UI_SCREENSHOT_DIR || os.tmpdir();
const user = {
    id: "ui-preview",
    name: "Alex Morgan",
    email: "alex@example.test",
    slug: "alex",
    timezone: "Asia/Kolkata",
    onboardingStep: 5,
};
const event = {
    id: "preview-session",
    slug: "strategy",
    title: "Strategy session",
    durationMin: 30,
    bufferMin: 0,
    isPaid: false,
    isActive: true,
};
const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.preview`;

async function run() {
    const browser = await chromium.launch();
    const errors = [];
    const requests = [];
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
    });
    let authenticated = false;
    let slowEvent = true;
    let availabilityRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "09:00",
        endTime: "17:00",
        timezone: user.timezone,
    }));
    let hoursSaved = false;
    await context.route("**/*", async (route) => {
        const request = route.request();
        if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
        const url = new URL(request.url());
        requests.push(`${request.method()} ${url.pathname}`);
        if (url.searchParams.has("_rsc") || request.headers()["rsc"]) return route.continue();
        const fulfill = (json, status = 200) =>
            route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(json),
            });
        if (url.pathname === "/auth/refresh")
            return authenticated ? fulfill({ accessToken, user }) : fulfill({ error: "Not signed in" }, 401);
        if (url.pathname === "/auth/login") {
            authenticated = true;
            return fulfill({ accessToken, user });
        }
        if (url.pathname === "/auth/me") return fulfill(user);
        if (url.pathname === "/room/status") return fulfill({ status: "open" });
        if (url.pathname === "/u/alex/strategy") {
            if (slowEvent) await new Promise((resolve) => setTimeout(resolve, 1000));
            return fulfill({ host: user, event });
        }
        if (url.pathname.endsWith("/slots")) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            const from = new Date(`${url.searchParams.get("from")}T12:00:00`);
            const until = new Date(`${url.searchParams.get("to")}T00:00:00`);
            const slots = [];
            for (const date = new Date(from); date < until; date.setDate(date.getDate() + 1)) {
                if ([0, 6].includes(date.getDay())) continue;
                for (let hour = 9; hour < 17; hour++) {
                    const slot = new Date(date);
                    slot.setHours(hour, 0, 0, 0);
                    if (slot.getTime() > Date.now()) slots.push(slot.toISOString());
                }
            }
            return fulfill({
                slots,
                eventTypeId: event.id,
                eventTitle: event.title,
                durationMin: 30,
            });
        }
        if (url.pathname === "/holds")
            return fulfill({
                holdToken: "preview-hold",
                expiresAt: new Date(Date.now() + 300000).toISOString(),
            });
        if (url.pathname.startsWith("/holds/")) return fulfill({});
        if (url.pathname === "/bookings")
            return fulfill({ error: "Couldn’t confirm your booking. Try again.", code: "UNAVAILABLE" }, 503);
        if (url.pathname === "/me/calendar/status")
            return fulfill({ available: true, connected: false, provider: "google" });
        if (url.pathname === "/me/availability") {
            if (request.method() === "PUT") {
                availabilityRules = request.postDataJSON().rules;
                hoursSaved = true;
            }
            return fulfill({ rules: availabilityRules });
        }
        if (url.pathname === "/me/event-types") return fulfill([event]);
        if (url.pathname === "/me/bookings") return fulfill([]);
        // The visual smoke test must never contact real providers or mutate real records.
        return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    try {
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Booking pages.");
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await page.getByRole("button", { name: "1:00 PM", exact: true }).click();
        await page.getByRole("button", { name: "Preview confirmation", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("1:00 PM");
        await page.getByRole("button", { name: "Preview the video room" }).click();
        await expect(page.getByText("From booked to together.")).toBeVisible();
        await page.getByRole("button", { name: "Back to booking preview" }).click();
        await page.screenshot({
            path: path.join(output, "sessionly-landing-desktop.png"),
            fullPage: true,
        });

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator("body")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.getByRole("button", { name: "Open menu" }).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
        await page.screenshot({
            path: path.join(output, "sessionly-landing-mobile.png"),
            fullPage: true,
        });
        await page.getByRole("button", { name: "Switch to dark theme" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await page.screenshot({ path: path.join(output, "sessionly-landing-dark.png"), fullPage: true });
        await page.getByRole("button", { name: "Switch to light theme" }).click();

        await page.goto("/login?next=%2Fdashboard%3Fpanel%3Dbookings");
        await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
        await page.getByRole("link", { name: "Create your free account" }).click();
        await expect(page).toHaveURL(/register\?next=/);
        await page.getByLabel("First name").fill("Alex");
        await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
        const field = page.getByLabel("Email", { exact: true });
        const unfocusedBox = await field.boundingBox();
        await field.focus();
        const focusedBox = await field.boundingBox();
        expect(focusedBox).toEqual(unfocusedBox);
        expect(await field.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
        expect(await field.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
        await page.getByLabel("Password (min 8 chars)", { exact: true }).fill("example-password");
        await page.getByLabel("Confirm password").fill("different-password");
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(page.locator("form").getByRole("alert")).toContainText("don’t match");
        await page.screenshot({
            path: path.join(output, "sessionly-register-mobile.png"),
            fullPage: true,
        });
        await page.getByRole("link", { name: "Sign in", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
        await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
        await page.getByLabel("Password", { exact: true }).fill("example-password");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).toHaveURL(/dashboard\?panel=bookings/);
        await expect(page.getByRole("heading", { name: "All bookings", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({
            path: path.join(output, "sessionly-dashboard-mobile.png"),
            fullPage: true,
        });

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto("/dashboard?panel=availability");
        await expect(page.getByRole("heading", { name: "Working hours", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Daily hours", exact: true })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        await expect(page.getByRole("button", { name: "Edit hours", exact: true })).toBeVisible();
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await page.screenshot({ path: path.join(output, "sessionly-hours-desktop.png"), fullPage: true });
        await page.getByRole("button", { name: "Edit hours", exact: true }).click();
        await page.getByRole("combobox", { name: "Monday start time 1" }).click();
        await page.getByRole("option", { name: "10:00 AM", exact: true }).click();
        await expect(page.getByRole("switch", { name: "Saturday available" })).not.toBeChecked();
        await page.getByRole("button", { name: "Copy Mon hours" }).click();
        await expect(page.getByRole("button", { name: "Tue", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Sat", exact: true })).toHaveAttribute("aria-pressed", "false");
        await page.getByRole("button", { name: "Apply", exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(output, "sessionly-hours-mobile.png"), fullPage: true });
        await page.getByRole("button", { name: "Save hours", exact: true }).click();
        await expect(page.getByText("Working hours saved.", { exact: true })).toBeVisible();
        expect(hoursSaved).toBe(true);
        expect(availabilityRules.map((rule) => rule.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5]);
        expect(availabilityRules.every((rule) => rule.startTime === "10:00")).toBe(true);
        await page.getByRole("button", { name: "Edit hours", exact: true }).click();
        await page.getByRole("switch", { name: "Saturday available" }).click();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Edit hours", exact: true }).click();
        await expect(page.getByRole("switch", { name: "Saturday available" })).not.toBeChecked();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole("button", { name: "Week overview", exact: true }).click();
        await page.screenshot({ path: path.join(output, "sessionly-hours-overview.png"), fullPage: true });
        await page.goto("/room/abc-defg-hjk");
        await expect(page.getByRole("heading", { name: "Ready to join?" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Join now", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Open settings", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
        await page.getByRole("button", { name: "Open settings", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Open settings", exact: true })).toHaveAttribute("aria-expanded", "false");
        await page.getByRole("button", { name: "Open settings", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Open settings", exact: true })).toBeFocused();
        await page.screenshot({ path: path.join(output, "sessionly-call-lobby.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(output, "sessionly-call-lobby-mobile.png"), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto("/u/alex/strategy");
        await expect(page.getByRole("status")).toContainText("Finding the details");
        await expect(page.getByRole("heading", { name: "Strategy session", exact: true })).toBeVisible();
        slowEvent = false;
        const calendar = page.getByTestId("booking-calendar-grid");
        await expect(page.getByRole("status", { name: "Availability updated", exact: true })).toBeVisible();
        const calendarBox = await calendar.boundingBox();
        for (let month = 0; month < 3; month++) {
            await page.getByRole("button", { name: "Next month", exact: true }).click();
            expect(await calendar.boundingBox()).toEqual(calendarBox);
            await expect(page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first()).toBeVisible();
            await expect(page.getByRole("status", { name: "Availability updated", exact: true })).toBeVisible();
            expect(await calendar.boundingBox()).toEqual(calendarBox);
        }
        const selectedDay = calendar.locator('[aria-pressed="true"]');
        const selectedBox = await selectedDay.boundingBox();
        expect(selectedBox.width).toBeLessThanOrEqual(40);
        expect(selectedBox.height).toBeLessThanOrEqual(40);
        await page
            .getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ })
            .first()
            .click();
        await page.getByLabel("Name", { exact: true }).fill("Jamie Taylor");
        await page.getByLabel("Email", { exact: true }).fill("jamie@example.test");
        await page.getByRole("button", { name: "Confirm booking", exact: true }).click();
        await expect(page.locator("form").getByRole("alert")).toContainText("Couldn’t confirm");
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Jamie Taylor");
        await expect(page.getByLabel("Email", { exact: true })).toHaveValue("jamie@example.test");
        await expect(page.getByRole("button", { name: "Confirm booking", exact: true })).toBeEnabled();
        await page.screenshot({
            path: path.join(output, "sessionly-booking-desktop.png"),
            fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({
            path: path.join(output, "sessionly-booking-mobile.png"),
            fullPage: true,
        });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/");
        expect(
            await page
                .locator(".page-enter")
                .first()
                .evaluate((element) => parseFloat(getComputedStyle(element).animationDuration)),
        ).toBeLessThan(0.01);
        expect(errors).toEqual([]);
        console.log(
            "PASS: themes, landing preview, mobile layout/menu, focus, auth redirects, daily-hours edit/copy/save/cancel, booking loading, stable calendar transitions, booking failure recovery, and reduced motion.",
        );
        console.log(`Screenshots: ${output}/sessionly-*.png`);
    } catch (error) {
        console.error("Browser errors:", errors);
        console.error("Requests:", requests);
        console.error("Visible page:", (await page.locator("body").innerText()).slice(0, 1600));
        throw error;
    } finally {
        await browser.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
