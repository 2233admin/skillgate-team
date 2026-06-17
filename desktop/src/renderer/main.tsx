import { createRoot } from "react-dom/client"
import { App } from "./app"
import { I18nProvider } from "./i18n"
import "./app.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

createRoot(root).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
)
