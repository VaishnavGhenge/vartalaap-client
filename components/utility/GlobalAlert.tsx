"use client";

import {SideWideAlert} from "@/components/layout/SiteWideAlert";
import {useRecoilState} from "recoil";
import {backendOfflineStatus} from "@/recoil/global";
import React, {useEffect} from "react";
import useSWR from "swr";
import {httpServerUri} from "@/utils/config";
import {getBackendStatus} from "@/utils/common";

interface GlobalAlertProps {
    initialBackendStatus: boolean;
}

export const GlobalAlert: React.FC<GlobalAlertProps> = ({initialBackendStatus}: GlobalAlertProps) => {
    const [isBackendOffline, setIsBackendOffline] = useRecoilState<boolean>(backendOfflineStatus);

    const {data} = useSWR(httpServerUri, getBackendStatus, {
        fallbackData: !initialBackendStatus, // Use initial server-fetched data
        refreshInterval: 5000, // Poll every 5 seconds
    });

    useEffect(() => {
        setIsBackendOffline(!data || !initialBackendStatus);
    }, [data, initialBackendStatus, setIsBackendOffline]);

    if (!isBackendOffline) return null;

    return <SideWideAlert color="red" message="Server seems offline, please check after some time :)"/>;
}