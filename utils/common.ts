import { httpServerUri } from "./config";

interface ValidationError {
    path: string;
    message: string;
}

export const getBackendStatus = async (): Promise<boolean> => {
    try {
        await fetch(httpServerUri, {cache: "no-store"});
        return true;
    } catch(error) {
        return false;
    }
}

export const transformZodError = (error: {errors: any[]}): ValidationError[] => {
    return error.errors.map((err: {path: string[], message: string}) => ({
        path: err.path.join('.'),
        message: err.message
    }));
};