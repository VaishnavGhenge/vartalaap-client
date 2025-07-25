import React from "react";

interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
    disabled?: boolean;
}

export const Button = (props: ButtonProps) => {
    return (
        <button
            type="button"
            {...props}
            disabled={false}
        >{props.children}</button>
    )
}