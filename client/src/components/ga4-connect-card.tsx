import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getGa4Status, disconnectGa4, queryKeys } from "@/lib/api";
import { queryClient, apiRequest } from "@/lib/queryClient";

export function Ga4ConnectCard() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ga4Status(),
    queryFn: getGa4Status,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGa4,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ga4Status() });
    },
  });

  const connected = data?.connected ?? false;
  const propertyId = data?.property_id ?? null;

  const handleConnect = async () => {
    const res = await apiRequest("GET", "/api/ga4/auth");
    if (res.redirected) {
      window.location.href = res.url;
    }
  };

  return (
    <Card data-testid="card-ga4-connect">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">
          Google Analytics 4
        </CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
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
            {propertyId && (
              <p className="text-xs text-muted-foreground truncate" data-testid="text-ga4-property">
                Property ID: {propertyId}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60">
              Daily sync at 06:00 UTC. Tracks bounce rate by device,
              session duration, and conversion rate by region.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-ga4-disconnect"
            >
              <Unplug className="mr-1 h-3 w-3" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Connect your GA4 property to track post-click behavior,
              mobile bounce rates, and conversion funnels.
            </p>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleConnect}
              data-testid="button-ga4-connect"
            >
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Connect Analytics
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
