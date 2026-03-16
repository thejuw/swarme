/**
 * Analytics & Logs Tab — Phase 31.3e (updated Phase 31.5)
 *
 * Traffic logs DataTable only. Audit log has been promoted to its own
 * dedicated "Audit Log" tab under Security in Phase 31.5.
 */

import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataColumn } from "@/components/admin/data-table";
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
} from "lucide-react";

interface TrafficLog {
  id: string;
  ip_address: string;
  device: string;
  country: string;
  referrer: string;
  route: string;
  created_at: string;
}

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
};

export function AnalyticsLogsTab() {
  const trafficQuery = useQuery<{ success: boolean; total: number; logs: TrafficLog[] }>({
    queryKey: ["/api/admin/traffic"],
  });
  const trafficLogs = trafficQuery.data?.logs || [];

  const trafficColumns: DataColumn<TrafficLog>[] = [
    {
      key: "created_at",
      label: "Time",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground font-mono">
          {new Date(row.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "route",
      label: "Route",
      render: (row) => <code className="text-[11px]">{row.route}</code>,
    },
    {
      key: "device",
      label: "Device",
      render: (row) => {
        const Icon = DEVICE_ICONS[row.device] || Monitor;
        return (
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span>{row.device}</span>
          </div>
        );
      },
    },
    {
      key: "country",
      label: "Country",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 text-muted-foreground" />
          <span>{row.country}</span>
        </div>
      ),
    },
    { key: "referrer", label: "Referrer" },
    {
      key: "ip_address",
      label: "IP",
      render: (row) => <code className="text-[10px] text-muted-foreground">{row.ip_address}</code>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Traffic Logs
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Recent visitor activity across all routes ({trafficQuery.data?.total || 0} total)
        </p>
      </div>
      <DataTable
        data={trafficLogs}
        columns={trafficColumns}
        exportFilename="traffic-logs"
        searchPlaceholder="Search by route, IP, country..."
        pageSize={15}
      />
    </div>
  );
}
