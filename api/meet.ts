import {post} from "@/api/generic";
import {httpServerUri} from "@/utils/config";

export const createMeet = (): Promise<Response> => {
    return post(`${httpServerUri}/meets/create`);
}