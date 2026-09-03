import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Login route loading state (shown while the session check runs). */
export default function LoginLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <Skeleton className="h-7 w-40" />
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
