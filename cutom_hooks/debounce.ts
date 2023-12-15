import { useEffect } from "react";

export function useDebounce(fn: Function, delay: number) {
  useEffect(() => {
    const handler = setTimeout(() => {
      fn()
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [delay, fn]);

  return;
}