import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Globe2, Video } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { LandingHeader } from "@/src/components/ui/LandingHeader";
import { SiteFooter } from "@/src/components/ui/SiteFooter";
import { BookingPreview } from "@/src/components/landing/BookingPreview";

const FEATURES = [
    {
        icon: CalendarDays,
        title: "Offer the times that work for you.",
        body: "Set your weekly hours and connect Google Calendar so busy periods are excluded from your booking page.",
    },
    {
        icon: Globe2,
        title: "Meet across timezones.",
        body: "Clients choose a time in their own timezone. You both get a confirmation email with the session details.",
    },
    {
        icon: Video,
        title: "Go from booked to face-to-face.",
        body: "Every booking has a private video room. Your client joins in their browser, without creating an account.",
    },
];

export default function Home() {
    return (
        <div className="landing-page">
            <LandingHeader />
            <main id="main-content">
                <section className="landing-hero mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28">
                    <div className="page-enter">
                        <p className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                            <span className="size-1.5 rounded-full bg-[hsl(var(--success))]" /> Scheduling + video,
                            together
                        </p>
                        <h1 className="font-display mt-7 text-[clamp(2.8rem,4.5vw,4.1rem)] leading-[1.06] tracking-tight">
                            Booking pages.
                            <br />
                            <span className="text-[hsl(var(--primary))]">
                                Video calls
                                <br />
                                built in.
                            </span>
                        </h1>
                        <p className="mt-6 max-w-md text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
                            Share your availability. Let clients book a time. Meet in a private video room—all with
                            Sessionly.
                        </p>
                        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                            Made for coaches, tutors, and independent consultants.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Button asChild size="lg" className="h-12 px-6">
                                <Link href="/register">
                                    Create your booking page <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                            <Button asChild variant="ghost" size="lg">
                                <Link href="#how-it-works">
                                    See how it works <span aria-hidden="true">↗</span>
                                </Link>
                            </Button>
                        </div>
                        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
                            Free during beta · No credit card needed
                        </p>
                        <div className="mt-10 flex items-center gap-3 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">
                            <Video className="size-5 shrink-0 text-[hsl(var(--primary))]" />
                            <span>No separate video app. No client account needed.</span>
                        </div>
                    </div>
                    <BookingPreview />
                </section>

                <section
                    id="how-it-works"
                    className="scroll-mt-24 border-y border-[hsl(var(--border))] bg-[hsl(var(--surface))]/65 px-5 py-16 sm:px-8 sm:py-20"
                >
                    <div className="mx-auto max-w-6xl">
                        <p className="label-caps">How Sessionly works</p>
                        <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-12">
                            {[
                                [
                                    "01",
                                    "Create your booking page",
                                    "Choose your hours, name your session, and get a personal link to share with clients.",
                                ],
                                [
                                    "02",
                                    "Your client picks a time",
                                    "They book from your page. You both receive the session details and meeting link by email.",
                                ],
                                [
                                    "03",
                                    "Join your video session",
                                    "When it’s time, open the private video room from your confirmation. Meet right in your browser.",
                                ],
                            ].map(([number, title, body]) => (
                                <div key={number}>
                                    <span className="font-display text-3xl text-[hsl(var(--primary))]/60">
                                        {number}
                                    </span>
                                    <h2 className="mt-4 text-lg font-semibold">{title}</h2>
                                    <p className="mt-2 text-sm leading-7 text-[hsl(var(--muted-foreground))]">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
                    <div className="max-w-xl">
                        <p className="label-caps">Thoughtful from the first click</p>
                        <h2 className="font-display mt-5 text-4xl leading-tight sm:text-5xl">
                            The booking and the call.
                            <br />
                            One less thing to juggle.
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {FEATURES.map(({ icon: Icon, title, body }) => (
                            <article key={title} className="experience-card p-7 sm:p-8">
                                <span className="mb-8 inline-flex size-11 items-center justify-center rounded-2xl bg-[hsl(var(--success-soft))] text-[hsl(var(--success-soft-foreground))]">
                                    <Icon className="size-5" />
                                </span>
                                <h3 className="font-display text-2xl leading-snug">{title}</h3>
                                <p className="mt-4 text-sm leading-7 text-[hsl(var(--muted-foreground))]">{body}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="px-5 pb-20 sm:px-8 sm:pb-28">
                    <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--success-soft))] p-7 sm:p-12 lg:grid-cols-[1.3fr_1fr] lg:p-16">
                        <div>
                            <p className="label-caps text-[hsl(var(--success-soft-foreground))]">Free during beta</p>
                            <h2 className="font-display mt-5 text-4xl leading-tight sm:text-5xl">
                                Make room for
                                <br />
                                your next client.
                            </h2>
                            <p className="mt-5 max-w-sm text-sm leading-7 text-[hsl(var(--muted-foreground))]">
                                Set up your booking page and start hosting sessions. Scheduling, calendar sync, and
                                video are included.
                            </p>
                            <p className="mt-3 max-w-sm text-xs leading-6 text-[hsl(var(--muted-foreground))]">
                                Client payments aren’t available in Sessionly yet.
                            </p>
                        </div>
                        <div className="rounded-2xl bg-[hsl(var(--surface))] p-7">
                            <div className="flex items-baseline gap-2">
                                <span className="font-display text-5xl">$0</span>
                                <span className="text-sm text-[hsl(var(--muted-foreground))]">during beta</span>
                            </div>
                            <ul className="my-6 space-y-3 text-sm">
                                {[
                                    "1 booking page",
                                    "10 bookings each month",
                                    "Built-in video calls",
                                    "Google Calendar connection",
                                ].map((item) => (
                                    <li key={item} className="flex items-center gap-2">
                                        <Check className="size-4 text-[hsl(var(--success))]" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <Button asChild size="lg" className="w-full">
                                <Link href="/register">
                                    Get started free <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                            <Link href="/pricing" className="mt-4 block text-center text-xs link">
                                About beta and future plans
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
