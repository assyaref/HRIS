"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Sign-in route error boundary. Never shows stack traces; the technical
 * detail is logged server-side.
 */
export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth] login page error", error);
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unable to load sign-in</CardTitle>
        <CardDescription>
          Something went wrong while preparing the sign-in page. Please try
          again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
