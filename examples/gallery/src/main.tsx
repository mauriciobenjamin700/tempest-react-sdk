import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
    ErrorBoundary,
    ErrorState,
    I18nProvider,
    QueryProvider,
    ThemeProvider,
    ToastProvider,
} from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import "./gallery.css";
import { App } from "./App";

const messages = {
    "pt-BR": {
        "gallery.title": "Galeria do tempest-react-sdk",
        "gallery.subtitle": "Catálogo visual + funcional",
        "gallery.greet": "Olá, {name}",
        "gallery.notifications_one": "{count} notificação",
        "gallery.notifications_other": "{count} notificações",
    },
    en: {
        "gallery.title": "tempest-react-sdk Gallery",
        "gallery.subtitle": "Visual + functional catalog",
        "gallery.greet": "Hi, {name}",
        "gallery.notifications_one": "{count} notification",
        "gallery.notifications_other": "{count} notifications",
    },
};

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="system">
            <I18nProvider locale="pt-BR" fallbackLocale="en" messages={messages}>
                <QueryProvider>
                    <ToastProvider>
                        <ErrorBoundary
                            fallback={({ error, reset }) => (
                                <ErrorState description={error.message} onRetry={reset} />
                            )}
                        >
                            <App />
                        </ErrorBoundary>
                    </ToastProvider>
                </QueryProvider>
            </I18nProvider>
        </ThemeProvider>
    </StrictMode>,
);
