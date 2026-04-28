import { Jaini, Ranga, Rozha_One, Yatra_One } from "next/font/google";
import { cn } from "@/src/lib/utils";

const yatraOne = Yatra_One({
    weight: "400",
    subsets: ["devanagari"],
});

const rozhaOne = Rozha_One({
    weight: "400",
    subsets: ["devanagari"],
});

const ranga = Ranga({
    weight: "400",
    subsets: ["devanagari"],
});

const jaini = Jaini({
    weight: "400",
    subsets: ["devanagari"],
});

type BrandWordmarkProps = {
    className?: string;
    variant?: "yatra" | "rozha" | "ranga" | "jaini";
};

export function BrandWordmark({
    className,
    variant = "rozha",
}: BrandWordmarkProps) {
    const fontClassName =
        variant === "rozha"
            ? rozhaOne.className
            : variant === "ranga"
              ? ranga.className
              : variant === "jaini"
                ? jaini.className
                : yatraOne.className;

    return (
        <span className="inline-flex flex-col">
            <span
                className={cn(
                    fontClassName,
                    "brand-wordmark leading-none text-[hsl(var(--foreground))]",
                    variant === "rozha"
                        ? "brand-wordmark-rozha"
                        : variant === "ranga"
                          ? "brand-wordmark-ranga"
                          : variant === "jaini"
                            ? "brand-wordmark-jaini"
                            : "brand-wordmark-yatra",
                    className,
                )}
            >
                वार्तालाप
            </span>
        </span>
    );
}
