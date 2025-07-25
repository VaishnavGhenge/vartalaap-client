import {post} from "@/src/services/api/generic";
import {LoginResponse, UserCredentials} from "@/src/types/auth";

export const login = (userCredentials: UserCredentials) => {
    return post<LoginResponse>("/login", userCredentials);
}