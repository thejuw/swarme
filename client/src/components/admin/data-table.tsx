/**
 * data-table.tsx — Phase 31: Enhanced DataTable with global filter + CSV export
 *
 * Reusable table component for all admin panel data views.
 * Features: global text search across all columns, CSV download,
 * column-based rendering with custom formatters.
 */

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";

export interface DataColumn<T> {
  key: string;
  label: string;
  /** Custom render function for the cell */
  render?: (row: T) => React.ReactNode;
  /** If true, column is hidden from CSV export */
  excludeFromExport?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataColumn<T>[];
  /** Title shown above the table */
  title?: string;
  /** Enable CSV export button */
  exportable?: boolean;
  /** Filename for CSV export (without extension) */
  exportFilename?: string;
  /** Rows per page (default 20) */
  pageSize?: number;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
}

function exportToCsv<T>(data: T[], columns: DataColumn<T>[], filename: string) {
  const exportCols = columns.filter((c) => !c.excludeFromExport);
  const header = exportCols.map((c) => `"${c.label}"`).join(",");
  const rows = data.map((row) =>
    exportCols
      .map((c) => {
        const val = (row as any)[c.key];
        const str = val === null || val === undefined ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  title,
  exportable = true,
  exportFilename = "export",
  pageSize = 20,
  searchPlaceholder = "Search...",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Global filter: match search term against all string columns
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when search changes
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {title && (
            <h3 className="text-sm font-semibold shrink-0">{title}</h3>
          )}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-xs"
              data-testid="input-table-search"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {filtered.length} rows
          </Badge>
          {exportable && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => exportToCsv(filtered, columns, exportFilename)}
              data-testid="button-export-csv"
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium h-9 px-3">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8 text-xs"
                >
                  {search ? "No matching results." : "No data available."}
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((row, i) => (
                <TableRow key={row.id || i}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-xs py-2.5 px-3">
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
