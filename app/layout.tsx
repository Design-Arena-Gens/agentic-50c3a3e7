import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garden Style Questionnaire",
  description: "An agentic assistant that learns your garden style, plants you love, how you use your outdoor space, and the feelings you want.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">Garden Designer AI</div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            <span>Built for inspiration ? not construction plans.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
