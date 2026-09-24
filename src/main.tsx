import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./lib/theme";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      <Toaster richColors closeButton position="top-center" />
    </ThemeProvider>
  </StrictMode>
);
