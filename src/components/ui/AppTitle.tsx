import Link from "next/link";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";

const AppTitle = () => {
    return (
        <Link href="/" className="inline-flex items-center">
            <SessionlyBrand size="sm" />
        </Link>
    );
};

export default AppTitle;
