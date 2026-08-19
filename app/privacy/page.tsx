import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/src/components/ui/LegalPage";

// TODO before launch: replace with the registered legal entity name and address
// once the Indian entity exists, and confirm CONTACT is a monitored mailbox.
// Google's OAuth verification checks that the contact on this page works.
const OPERATOR = "Sessionly";
const CONTACT = "support@getsessionly.com";

export const metadata: Metadata = {
    title: "Privacy Policy — Sessionly",
    description: "What Sessionly collects, why, who it is shared with, and how to have it deleted.",
};

export default function PrivacyPage() {
    return (
        <LegalPage
            title="Privacy Policy"
            updated="19 August 2026"
            intro={
                <p>
                    {OPERATOR} is scheduling and video software for people who get paid to show up on a
                    call. This page describes what we collect, why we collect it, who else sees it, and
                    how to have it removed. It covers getsessionly.com and the Sessionly application.
                </p>
            }
        >
            <LegalSection heading="What we collect">
                <p><strong>If you create an account (a host):</strong></p>
                <LegalList
                    items={[
                        "Your name, email address, chosen booking URL, and time zone.",
                        "An avatar image URL, if you set one.",
                        "Your password, stored only as a bcrypt hash. We never store or see the password itself.",
                        "Your availability rules, event types, and bookings.",
                    ]}
                />
                <p><strong>If you book a session (a guest):</strong></p>
                <LegalList
                    items={[
                        "Your name and email address, which you enter on the booking form.",
                        "The session you booked and its time, and a cancellation reason if you give one.",
                    ]}
                />
                <p>
                    Guests do not need an account. We do not ask guests for anything beyond what the host
                    needs to hold the session.
                </p>
            </LegalSection>

            <LegalSection heading="Video calls">
                <p>
                    Calls run over WebRTC and are relayed by Cloudflare Realtime. <strong>We do not record
                    audio or video, and we have no facility to do so.</strong> Media passes through
                    Cloudflare&apos;s infrastructure to reach the other participants and is not stored by us.
                </p>
                <p>
                    We do collect technical measurements about call quality: how long a call took to
                    connect, round-trip time, packet loss, and whether a connection attempt failed. These
                    describe the connection, not its contents.
                </p>
            </LegalSection>

            <LegalSection heading="Google Calendar">
                <p>
                    Connecting a Google Calendar is optional and off until you turn it on. When you connect
                    one, we ask Google for two permissions and no others:
                </p>
                <LegalList
                    items={[
                        <>
                            <code>calendar.freebusy</code> — read the times you are busy. This returns time
                            ranges only. We do not receive event titles, descriptions, locations, or
                            attendees, and we could not read them if we wanted to.
                        </>,
                        <>
                            <code>calendar.events</code> — add a calendar entry when a session is booked,
                            and remove it if the session is cancelled.
                        </>,
                    ]}
                />
                <p>
                    The access and refresh tokens Google issues are encrypted with AES-256-GCM before being
                    written to our database, using a key held outside it. Disconnecting from your dashboard
                    revokes the grant with Google and deletes our copy of the tokens.
                </p>
                <p>
                    Sessionly&apos;s use of information received from Google APIs adheres to the{" "}
                    <a
                        href="https://developers.google.com/terms/api-services-user-data-policy"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[hsl(var(--primary))] underline underline-offset-4"
                    >
                        Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements. We do not use Google Calendar data for
                    advertising, we do not sell it, and we do not use it to train machine-learning models.
                </p>
            </LegalSection>

            <LegalSection heading="Why we collect it">
                <p>
                    To run the service you asked for: show your booking page, decide which times are
                    bookable, send booking confirmations and cancellations, place the call, and keep the
                    product working. We do not sell personal data, and we do not run advertising.
                </p>
            </LegalSection>

            <LegalSection heading="Who else processes it">
                <p>We use these providers. Each sees only what it needs to do its job.</p>
                <LegalList
                    items={[
                        "Cloudflare — video and audio relay, and network connectivity for calls.",
                        "Google — calendar free/busy and event write-back, only if you connect a calendar.",
                        "Resend — sending booking confirmation, cancellation, and reminder emails.",
                        "Sentry — error reports when something breaks. These carry technical context such as a room identifier, not call contents.",
                        "Vercel — hosting the website.",
                        "Railway — hosting the application server and database.",
                    ]}
                />
                <p>
                    Our servers and database are hosted outside India, so your data is processed abroad. We
                    disclose personal data to law enforcement only where legally required.
                </p>
            </LegalSection>

            <LegalSection heading="How long we keep it">
                <LegalList
                    items={[
                        "Account and booking records: for as long as your account exists.",
                        "Sign-in sessions: refresh tokens are stored as hashes and expire on their own; signing out deletes them.",
                        "Calendar tokens: until you disconnect, or Google revokes the grant.",
                        "Error reports and call-quality measurements: retained on a rolling basis for debugging and never tied to call contents.",
                    ]}
                />
                <p>
                    Delete your account and we delete the account and its bookings. Ask us and we will
                    confirm when it is done.
                </p>
            </LegalSection>

            <LegalSection heading="Your choices">
                <LegalList
                    items={[
                        "See or correct your details from your dashboard.",
                        "Disconnect Google Calendar at any time from the dashboard, which revokes our access.",
                        "Ask for a copy of your data, or for it to be deleted, by emailing us.",
                        "Guests: email us and we will remove your booking records from a host's account on request.",
                    ]}
                />
                <p>
                    Depending on where you live you may have further rights over your personal data,
                    including access, correction, erasure, and complaint to a supervisory authority. Write
                    to us and we will act on the request.
                </p>
            </LegalSection>

            <LegalSection heading="Children">
                <p>
                    Sessionly is not intended for people under 16, and we do not knowingly collect their
                    personal data.
                </p>
            </LegalSection>

            <LegalSection heading="Changes">
                <p>
                    If this policy changes in a way that affects you, we will update the date at the top and
                    tell account holders by email before the change takes effect.
                </p>
            </LegalSection>

            <LegalSection heading="Contact">
                <p>
                    Email{" "}
                    <a href={`mailto:${CONTACT}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                        {CONTACT}
                    </a>{" "}
                    with any question about this policy or a request about your data.
                </p>
                <p>
                    See also our{" "}
                    <Link href="/terms" className="text-[hsl(var(--primary))] underline underline-offset-4">
                        Terms of Service
                    </Link>
                    .
                </p>
            </LegalSection>
        </LegalPage>
    );
}
