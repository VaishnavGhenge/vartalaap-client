import { useMemo } from "react";

interface Props {
    message: string;
    color?: "red" | "green" | "blue";
}

export const FormAlert = (props: Props) => {
    const { message} = props;

    const colorClass: string = useMemo(() => {
        switch (props.color) {
            case "green": return "bg-green-500";
            case "red": return "bg-red-500";
            case "blue": return "bg-blue-500";
            default: return "bg-green-500";
        }
    }, [props.color]);

    return (
        <div className={`${colorClass} px-2 py-2 rounded mb-2`}>
            <div className="flex justify-center items-center">
                <p className="text-white text-xs">{message}</p>
            </div>
        </div>
    )
}