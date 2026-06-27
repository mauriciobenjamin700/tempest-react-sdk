import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "tempest-react-sdk/styles.css";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
