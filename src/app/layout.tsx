import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quizora — Student Assessment",
  description: "Departmental student assessment and quiz platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
