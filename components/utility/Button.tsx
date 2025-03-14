import React from "react";
import {useRecoilValue} from "recoil";
import {backendOfflineStatus} from "@/recoil/global";

interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export const Button = (props: ButtonProps) => {
    const isBackendOffline = useRecoilValue(backendOfflineStatus);

    return (
        <button type="button" {...props} disabled={isBackendOffline || props.disabled}>
            {props.children}
        </button>
    )
}