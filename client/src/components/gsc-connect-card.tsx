import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getGscStatus, disconnectGsc, queryKeys } from "@/lib/api";
import { queryClient, apiRequest } from "@/lib/queryClient";

export function GscConnectCard() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.gscStatus(),
    queryFn: getGscStatus,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGsc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gscStatus() });
    },
  });

  const connected = data?.connected ?? false;
  const propertyUrl = data?.property_url ?? null;

  const handleConnect = async () => {
    // Redirect to GSC OAuth flow — backend handles the redirect
    const res = await apiRequest("GET", "/api/gsc/auth");
    // The mock redirects back to the settings page
    if (res.redirected) {
      window.location.href = res.url;
    }
  };

  return (
    <Card data-testid="card-gsc-connect">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">
          Google Search Console
        </CardTitle>
        <Search className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
            Checking connection...
          </div>
        ) : connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            </div>
            {propertyUrl && (
              <p className="text-xs text-muted-foreground truncate" data-testid="text-gsc-property">
                {propertyUrl}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60">
              Daily data sync runs at 06:00 UTC. Metrics appear in the SERP
              Performance chart above.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-gsc-disconnect"
            >
              <Unplug className="mr-1 h-3 w-3" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Connect your Search Console property to see real clicks,
              impressions, CTR, and average position data on your dashboard.
            </p>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleConnect}
              data-testid="button-gsc-connect"
            >
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Connect Search Console
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
