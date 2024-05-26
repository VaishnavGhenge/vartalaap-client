import { useCallback, useState } from "react";

export function useInput<T>(initialState: T): [T, (e: any) => void] {
    const [state, setState] = useState(initialState);

    const handleChange = useCallback((e: any) => {
        setState((prevState: T) => ({
            ...prevState,
            [e.target.name]: e.target.value,
        }));
    }, []);

    return [state, handleChange];
}

export function getEmptyFormObject<T>(obj: any): T {
    const newObj = { ...obj };
    Object.keys(obj).forEach((key) => {
        newObj[key] = "";
    });

    return newObj;
}
