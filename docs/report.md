  ## What I would do next

  In this order:

  1. Make calls trustworthy:
      - adaptive bitrate/resolution and audio-only fallback;
      - persistent media-state banner with “retry camera,” “switch device,” and “reconnect media”;
      - in-call settings and diagnostics;
      - fix and release screen sharing;
      - test network switching, 5–10% packet loss, sleep/wake, long calls, and mobile camera changes.

  2. Make quality measurable:
      - run critical two-, three-, and four-participant media-flow tests in CI;
      - add production canary calls;
      - scrape and retain metrics;
      - add disconnect-rate and repair-success metrics;
      - publish actual rolling results only after enough samples exist.

  3. Make the call belong to the paid-session workflow:
      - show booking/client context inside the room;
      - add simple link/chat exchange;
      - add private host notes and a post-call outcome/follow-up;
      - consider recordings/transcripts later, after privacy and consent are designed.

  4. Reduce the code’s coordination surface:
      - split useCall into room lifecycle, media lifecycle, quality monitoring, and recovery controllers;
      - make media state a single explicit state machine rather than separate booleans and physical tracks;
      - keep SfuSession transport-only;
      - add architecture decision records for the per-remote subscription-PC tradeoff.

  ## How you can contribute without surrendering decisions to AI

  Take ownership of contracts rather than trying to type every line manually.

  Start with one vertical slice: in-call device recovery is ideal. Personally write a one-page contract covering:

  - what the user sees when audio/video stops;
  - what actions are available;
  - what counts as recovery;
  - how it behaves during signaling loss;
  - the browser test that proves it.

  Then have AI explain the relevant files, propose a small diff, and write failing tests. Review every state transition yourself. Do not accept changes that enlarge useCall, add another
  boolean, or lack a real browser acceptance test.

  A good personal learning path through this repository is:

  1. vartalaap-client/src/components/features/MeetCall.tsx:35 — user behavior.
  2. vartalaap-client/src/stores/meet.ts:4 and vartalaap-client/src/stores/peer.ts:92 — state and devices.
  3. vartalaap-client/src/hooks/use-call.ts:54 — orchestration.
  4. vartalaap-client/src/services/webrtc/call-reconciler.ts:59 — desired versus applied media.
  5. vartalaap-client/src/services/webrtc/sfu-session.ts:100 — transport.