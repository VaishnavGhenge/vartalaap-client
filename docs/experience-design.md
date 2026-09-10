# Sessionly experience

The product should feel clear, dependable, and quick. Lead with what it does:
booking pages with video calls built in, for coaches, tutors, and independent
consultants. The landing preview demonstrates booking, confirmation, and the
video room, and explicitly identifies itself as a preview.

White is the default theme, including on devices with a dark OS preference.
An explicit saved theme choice is respected. Deep blue identifies actions;
mint identifies confirmations and positive states. Shared CSS tokens carry
both light and dark palettes. Instrument Sans carries headings and body text.

Motion must not move the page around. Route arrivals use a brief opacity change,
with reduced-motion support and no animation around active calls. Buttons do not
scale on press. Scrollbar space is reserved. Text fields use one focus treatment,
including an error-colored treatment for invalid fields.

The calendar always has six rows and compact date controls. Month requests keep
the current month and time list visible until the next response is ready; the
month, dates, and times then update together. Previous requests cannot replace a
newer result. The details form stays mounted after the first time selection so
changing dates does not collapse the page or lose input.

Loading placeholders follow the destination: account form, dashboard navigation
and rows, booking summary and calendar, or confirmation card. A generic route
uses a small loading status rather than inventing a content skeleton.

Working hours default to a readable daily list, with a compact optional week
overview. Editing exposes time windows, day toggles, and copying to weekdays;
weekends require explicit selection. Empty saved schedules remain empty, failed
loads offer retry, and validation explains why saving is unavailable.

Run `node scripts/verify-experience.cjs` against the local frontend. It mocks API
requests and checks mobile layout, default and persisted themes, the interactive
preview, account redirects, input focus geometry, fixed calendar geometry during
month changes, retained time lists, booking failure recovery, daily-hours editing
and copying, mocked schedule persistence, and reduced motion.
Screenshots go to the OS temporary directory (or `UI_SCREENSHOT_DIR`). These are
UI checks, not live booking, email, calendar, or media acceptance tests.

Call stages use short opacity-only entrances. Participant tiles retain their
keyed DOM elements across pinning and participant changes; only their geometry
transitions, with motion disabled for reduced-motion preferences. Two-person
calls emphasize the remote participant with a smaller self-preview. Speaking
indicators never change border width. Connection recovery uses a reserved status
region rather than a full-screen overlay, and device errors remain actionable.
Settings stay available during calls, support Escape and focus restoration, and
leaving stops media before presenting a rejoin screen. Browser smoke covers the
lobby and settings; component tests check media element identity and recovery.
Actual two-person sound/video, hardware switching, and network recovery still
require live acceptance.
