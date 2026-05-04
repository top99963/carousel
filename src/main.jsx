import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import CircularCarousel from "./CircularCarousel.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    {/* <CircularCarousel /> */}
  </StrictMode>,
);
