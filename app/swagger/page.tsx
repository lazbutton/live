import type { Metadata } from "next";

import { EventsApiReference } from "../docs/api/api-reference-client";

export const metadata: Metadata = {
  title: "Swagger API Events",
  description:
    "Interface Swagger/Scalar de l'API publique OutLive Events.",
};

export default function SwaggerPage() {
  return <EventsApiReference />;
}
