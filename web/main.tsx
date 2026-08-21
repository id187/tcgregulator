import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./app/globals.css";
import "./app/styles/tokens.css";
import "./app/styles/typography.css";
import "./app/styles/distribution.css";
import "./app/styles/control-room.css";
import "./app/styles/decision-events.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("TCG REGULATOR could not find its application root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
