import { createRoot } from "react-dom/client";
import "./i18n"; // Phase 10: Initialize i18next before React tree
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
