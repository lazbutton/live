"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export function EventsApiReference() {
  return (
    <div className="min-h-screen w-full bg-black">
      <ApiReferenceReact
        configuration={{
          url: "/api/v1/openapi.json",
          persistAuth: true,
          hideDarkModeToggle: false,
          defaultOpenAllTags: true,
        }}
      />
    </div>
  );
}
