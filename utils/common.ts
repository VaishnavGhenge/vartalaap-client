import { httpServerUri } from "./config";

export async function checkBackendHealthy(): Promise<boolean> {
    try {
        await fetch(httpServerUri);
        return true;
    } catch(error) {
        return false;
    }
}
