"use client";

import {SideWideAlert} from "@/src/components/ui/SiteWideAlert";
import React from "react";

interface GlobalAlertProps {
    initialBackendStatus: boolean;
}

export const GlobalAlert: React.FC<GlobalAlertProps> = ({initialBackendStatus}: GlobalAlertProps) => {
    return <SideWideAlert color="red" message="Server seems offline, please check after some time :)"/>;
}