import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Globe, GripHorizontal, Info } from "lucide-react";

export default function QuickCapture() {
  const appOrigin = window.location.origin;
  const bookmarkletCode = `javascript:void(location.href='${appOrigin}/intake?url='+encodeURIComponent(location.href))`;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Quick Capture</h1>
        <p className="text-muted-foreground">Save job listings to your inbox with one click from any browser tab.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Your Bookmarklet
          </CardTitle>
          <CardDescription>
            Drag the button below to your browser's bookmarks bar to install it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center p-6 rounded-lg border-2 border-dashed bg-muted/30">
            <a
              href={bookmarkletCode}
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium text-sm cursor-grab active:cursor-grabbing select-none"
              data-testid="link-bookmarklet"
              title="Drag this to your bookmarks bar"
            >
              <GripHorizontal className="h-4 w-4" />
              Capture to Job Copilot
            </a>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Drag the button above into your bookmarks bar. Do not click it here — it only works from other pages.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="shrink-0 mt-0.5">1</Badge>
              <div>
                <p className="font-medium text-sm" data-testid="text-step-1">Install the bookmarklet</p>
                <p className="text-sm text-muted-foreground">Drag the "Capture to Job Copilot" button above into your browser's bookmarks bar. If you don't see the bookmarks bar, press Ctrl+Shift+B (Windows) or Cmd+Shift+B (Mac).</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="shrink-0 mt-0.5">2</Badge>
              <div>
                <p className="font-medium text-sm" data-testid="text-step-2">Browse any job listing</p>
                <p className="text-sm text-muted-foreground">Navigate to a job posting on any site — LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, or any company career page.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="shrink-0 mt-0.5">3</Badge>
              <div>
                <p className="font-medium text-sm" data-testid="text-step-3">Click the bookmarklet</p>
                <p className="text-sm text-muted-foreground">Click "Capture to Job Copilot" in your bookmarks bar. It will open the Job Intake page with the URL already filled in.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="shrink-0 mt-0.5">4</Badge>
              <div>
                <p className="font-medium text-sm" data-testid="text-step-4">Job is imported automatically</p>
                <p className="text-sm text-muted-foreground">The app will automatically scrape the job details and add it to your Jobs Inbox. You'll see a confirmation toast when it's done.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Supported Sites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["LinkedIn", "Indeed", "Glassdoor", "Greenhouse", "Lever", "Workday", "iCIMS", "SmartRecruiters", "Company Career Pages"].map((site) => (
              <Badge key={site} variant="outline" data-testid={`badge-site-${site.toLowerCase().replace(/\s+/g, "-")}`}>{site}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The bookmarklet simply passes the current page URL to your app. It does not scrape or interact with the page directly. All processing happens server-side in your Job Intake pipeline.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">Manual Alternative</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If you can't use the bookmarklet, you can also copy any job URL and paste it directly into the
            <a href="/intake" className="text-primary hover:underline mx-1" data-testid="link-intake">Job Intake</a>
            page's "Paste Link" tab.
          </p>
          <div className="p-3 rounded-md bg-muted font-mono text-xs break-all" data-testid="text-manual-url">
            {appOrigin}/intake?url=<span className="text-muted-foreground">{'<'}encoded-job-url{'>'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
