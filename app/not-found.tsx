import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-text-primary">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-text-primary">
          Page Not Found
        </h2>
        <p className="mb-8 text-text-secondary">
          The page you're looking for doesn't exist.
        </p>
        <Link href="/">
          <Button variant="primary">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
