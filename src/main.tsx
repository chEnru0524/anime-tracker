import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { StoreProvider } from "./store";
import App from "./App";
import "./style.css";
// PKCE returns a query code, leaving HashRouter's fragment free for routing.
if (
  new URLSearchParams(location.search).has("code") ||
  new URLSearchParams(location.search).has("error")
) {
  history.replaceState(
    null,
    "",
    location.pathname + location.search + "#/account",
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
);
