import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/src/components/ui/LegalPage";

// TODO before launch: replace with the registered legal entity name and address
// once the Indian entity exists, and set GOVERNING_LAW to match where it is
// registered. Shipping the wrong jurisdiction is worse than shipping none.
const OPERATOR = "Sessionly";
const CONTACT = "support@getsessionly.com";
const GOVERNING_LAW = "India";

export const metadata: Metadata = {
    title: "Terms of Service — Sessionly",
    description: "The terms you agree to when you use Sessionly.",
};

export default function TermsPage() {
    return (
        <LegalPage
            title="Terms of Service"
            updated="19 August 2026"
            intro={
                <p>
                    These terms cover your use of {OPERATOR} at getsessionly.com. Creating an account or
                    booking a session means you accept them. If you do not, do not use the service.
                </p>
            }
        >
            <LegalSection heading="What Sessionly does">
                <p>
                    Sessionly gives a host a public booking page, decides which times are bookable from the
                    availability they set, and hosts the resulting video call. Optionally it reads their
                    calendar to avoid double-booking and writes confirmed sessions back to it.
                </p>
            </LegalSection>

            <LegalSection heading="Sessionly is not a party to your sessions">
                <p>
                    A booking is an arrangement between a host and their guest. We provide the software that
                    schedules it and the connection that carries it. We do not supply, supervise, endorse,
                    or take responsibility for the coaching, consulting, therapy, tuition, or other service
                    a host delivers, and we are not liable for what happens on a call.
                </p>
                <p>
                    Hosts are responsible for their own professional obligations, including any licensing,
                    tax, or confidentiality duties that apply to their work.
                </p>
            </LegalSection>

            <LegalSection heading="Accounts">
                <LegalList
                    items={[
                        "You must be at least 16 years old to hold an account.",
                        "Give accurate details and keep your password to yourself.",
                        "You are responsible for what happens under your account.",
                        "Tell us promptly if you think someone else has access to it.",
                    ]}
                />
            </LegalSection>

            <LegalSection heading="Acceptable use">
                <p>Do not use Sessionly to:</p>
                <LegalList
                    items={[
                        "Break the law, or help someone else break it.",
                        "Harass, threaten, or abuse anyone, on a call or through a booking form.",
                        "Send unsolicited bulk email through booking notifications.",
                        "Attack, overload, probe, or reverse engineer the service.",
                        "Record a call without the consent of everyone on it, where consent is required.",
                        "Impersonate another person or business.",
                    ]}
                />
                <p>
                    We may suspend or close an account that breaks these rules, and we will tell you why
                    unless the law prevents it.
                </p>
            </LegalSection>

            <LegalSection heading="Price and payment">
                <p>
                    Sessionly is currently free while in beta. Paid plans are described on the{" "}
                    <Link href="/pricing" className="text-[hsl(var(--primary))] underline underline-offset-4">
                        pricing page
                    </Link>{" "}
                    and are not yet active. We do not currently process payments between hosts and their
                    clients. If that changes, we will publish updated terms and tell account holders before
                    charging anyone.
                </p>
            </LegalSection>

            <LegalSection heading="Availability">
                <p>
                    We aim for a reliable service and publish the connection-quality targets we hold
                    ourselves to, but during beta Sessionly is provided as is, without a guaranteed uptime
                    commitment. We may change, interrupt, or discontinue features. Where a change would
                    materially affect how you use the product, we will give notice by email.
                </p>
            </LegalSection>

            <LegalSection heading="Your content">
                <p>
                    You keep ownership of everything you put into Sessionly: your profile, event types,
                    booking records, and anything said on a call. You grant us only the permission needed to
                    operate the service for you, such as displaying your booking page publicly and sending
                    confirmation emails on your behalf. Calls are not recorded.
                </p>
            </LegalSection>

            <LegalSection heading="Liability">
                <p>
                    To the extent the law allows, Sessionly is not liable for indirect or consequential loss,
                    lost profits, lost business, or lost data arising from your use of the service. Nothing
                    here limits liability that cannot lawfully be limited, including for death, personal
                    injury, or fraud.
                </p>
            </LegalSection>

            <LegalSection heading="Ending it">
                <p>
                    You can delete your account at any time. We may close an account for a breach of these
                    terms, or if we stop offering the service. On closure your booking pages stop working
                    and your data is deleted as described in the{" "}
                    <Link href="/privacy" className="text-[hsl(var(--primary))] underline underline-offset-4">
                        Privacy Policy
                    </Link>
                    . Sessions already booked will not go ahead through Sessionly, so tell your guests.
                </p>
            </LegalSection>

            <LegalSection heading="Changes to these terms">
                <p>
                    We will update the date at the top when these terms change, and email account holders
                    before a material change takes effect. Continuing to use Sessionly after that means you
                    accept the new terms.
                </p>
            </LegalSection>

            <LegalSection heading="Governing law">
                <p>
                    These terms are governed by the laws of {GOVERNING_LAW}, and disputes fall to the courts
                    there, unless mandatory consumer-protection law in your country of residence says
                    otherwise.
                </p>
            </LegalSection>

            <LegalSection heading="Contact">
                <p>
                    Email{" "}
                    <a href={`mailto:${CONTACT}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                        {CONTACT}
                    </a>{" "}
                    with any question about these terms.
                </p>
            </LegalSection>
        </LegalPage>
    );
}
