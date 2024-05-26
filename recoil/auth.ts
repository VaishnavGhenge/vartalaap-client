import { atom } from "recoil";
import {IUser} from "@/utils/types";

export const user = atom<IUser | null>({
    key: "user",
    default: null,
});
