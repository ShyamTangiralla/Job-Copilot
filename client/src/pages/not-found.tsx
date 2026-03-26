import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-muted">
              <FileQuestion className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            The page you're looking for doesn't exist or may have been moved.
          </p>
          <Link href="/">
            <Button data-testid="button-back-home">
              <Home className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
