import { useState } from "react";

interface SuccessMessage {
  title?: string;
  description?: string;
}

export function useCopyToClipboard() {
  const [hasCopied, setHasCopied] = useState(false);

  const copyToClipboard = async (text: string, successMessage?: SuccessMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return { copyToClipboard, hasCopied };
}
