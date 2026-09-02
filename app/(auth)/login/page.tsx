import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Placeholder only — authentication is deliberately out of scope for
 * Phase 1 and will be implemented in Phase 3.
 */
export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Sign in</CardTitle>
          <Badge variant="outline">Phase 3</Badge>
        </div>
        <CardDescription>
          A placeholder for the future authentication route group.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Authentication is not part of the current phase. The sign-in flow will
          replace this page when Phase 3 lands.
        </p>
        <div>
          <Link href="/" className={buttonVariants()}>
            Back to home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
