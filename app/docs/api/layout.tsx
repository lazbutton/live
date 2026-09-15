import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Events",
  description:
    "Documentation OpenAPI de l'API publique OutLive : événements approuvés et soumissions communautaires.",
};

export default function ApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
