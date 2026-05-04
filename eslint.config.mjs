import { createRequire } from "module";

const require = createRequire(import.meta.url);
const coreWebVitals = require("eslint-config-next/core-web-vitals");

export default [
  ...coreWebVitals,
  {
    rules: {
      // setState inside useEffect is valid for initialization and prop-driven
      // resets; the rule is too aggressive for this codebase.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
