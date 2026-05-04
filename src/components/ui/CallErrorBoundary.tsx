"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";
import { PhoneOff, RefreshCw } from "lucide-react";

interface Props {
    children: React.ReactNode;
    onLeave?: () => void;
}

interface State {
    hasError: boolean;
    eventId: string | null;
}

export class CallErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false, eventId: null };

    static getDerivedStateFromError(): Partial<State> {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        const eventId = Sentry.captureException(error, {
            extra: { componentStack: info.componentStack },
        });
        this.setState({ eventId: eventId ?? null });
    }

    private handleReset = () => {
        this.setState({ hasError: false, eventId: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[hsl(var(--background))] px-6 text-center">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Something went wrong in the call
                </p>
                {this.state.eventId && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Reference: {this.state.eventId}
                    </p>
                )}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="ctrl-btn ctrl-btn-on flex items-center gap-2 px-4 py-2 text-sm"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </button>
                    {this.props.onLeave && (
                        <button
                            type="button"
                            onClick={this.props.onLeave}
                            className="ctrl-btn ctrl-btn-off flex items-center gap-2 px-4 py-2 text-sm"
                        >
                            <PhoneOff className="h-4 w-4" />
                            Leave call
                        </button>
                    )}
                </div>
            </div>
        );
    }
}
