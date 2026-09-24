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
      <Toaster
        position="bottom-center"
        toastOptions={{ duration: 2600, className: "qp-toast" }}
      />
    </ThemeProvider>
  </StrictMode>
);
