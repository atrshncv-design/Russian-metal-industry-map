"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  BarChart3,
  MapPin,
  X,
  Layers,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { toPng } from "html-to-image";

/* ─── Types ─── */
interface ColumnDef {
  key: string;
  label: string;
}

interface IndicatorDef {
  key: string;
  label: string;
  columns: ColumnDef[];
  data: Record<string, Record<string, number | null>>;
}

interface RegionData {
  name: string;
  svgId: string | null;
  onMap: boolean;
  [key: string]: string | number | boolean | null;
}

interface MapData {
  indicators: IndicatorDef[];
  regions: Record<string, RegionData>;
}

/* ─── Constants ─── */
const COLOR_LEVELS = 4;
const BLUE_SHADES = [
  "#dbeafe",
  "#93c5fd",
  "#60a5fa",
  "#1d4ed8",
];
const INDICATOR_SCALES: Record<string, number[]> = {
  employment_2024: [0, 2, 4, 6, 8],
  shipment_2025: [0, 10, 20, 30, 40],
  localization_coeff: [0, 2, 4, 6, 8],
  budget_2025: [0, 2, 4, 6, 8],
};
const NO_DATA_FILL = "#0f172a";
const STROKE_COLOR = "#1e3a8a";
const CITY_MARKER_REGION_BY_ID: Record<string, string> = {
  "Sankt-Peterburg": "город Санкт-Петербург",
  Sevastopol: "город Севастополь",
  circle1: "город Москва",
};

function classifyValue(value: number | null, scale: number[]): number {
  if (value === null || value === undefined) return 0;
  const bins = Math.max(1, scale.length - 1);
  if (bins === 1) return 0;
  if (value <= scale[0]) return 0;

  for (let i = 0; i < bins; i++) {
    if (value < scale[i + 1]) {
      return Math.min(i, COLOR_LEVELS - 1);
    }
  }
  return Math.min(bins - 1, COLOR_LEVELS - 1);
}

function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return "—";
  if (Math.abs(num) >= 1) {
    return num.toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    });
  }
  return num.toFixed(4);
}

function isPercentColumn(label: string, key: string): boolean {
  const normalized = `${label} ${key}`.toLowerCase();
  return normalized.includes("доля") || normalized.includes("_share");
}

function normalizeValue(
  value: number | null,
  indicatorKey: string | undefined,
  column: ColumnDef | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (!column) return value;
  if (isPercentColumn(column.label, column.key)) return value * 100;
  if (indicatorKey === "localization_coeff" && column.key === "localization_coeff") {
    return value * 100;
  }
  return value;
}

function formatColumnValue(
  value: number | null,
  indicatorKey: string | undefined,
  column: ColumnDef | null | undefined
): string {
  const normalized = normalizeValue(value, indicatorKey, column);
  if (normalized === null) return "—";
  if (column && isPercentColumn(column.label, column.key)) {
    return `${normalized.toFixed(2)}%`;
  }
  if (column && indicatorKey === "localization_coeff" && column.key === "localization_coeff") {
    return normalized.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return formatNumber(normalized);
}

/* ─── Component ─── */
export default function RussiaMapPage() {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedIndicator, setSelectedIndicator] = useState("budget_2025");
  const [selectedColumn, setSelectedColumn] = useState("budget_share");
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [dataRes, svgRes] = await Promise.all([
          fetch("/api/map-data"),
          fetch("/data/russia-map-clean.svg"),
        ]);
        const data = await dataRes.json();
        const svg = await svgRes.text();
        setMapData(data);
        setSvgContent(svg);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Current indicator and column defs
  const currentIndicator = useMemo(() => {
    if (!mapData) return null;
    return mapData.indicators.find((i) => i.key === selectedIndicator) || null;
  }, [mapData, selectedIndicator]);

  const currentColumns = useMemo(() => {
    return currentIndicator?.columns || [];
  }, [currentIndicator]);

  const currentScale = useMemo(() => {
    return INDICATOR_SCALES[selectedIndicator] || [0, 2, 4, 6, 8];
  }, [selectedIndicator]);

  // Region data for tooltip
  const hoveredData = useMemo(() => {
    if (!hoveredRegion || !mapData) return null;
    return (
      mapData.regions[hoveredRegion] || {
        name: hoveredRegion,
        svgId: null,
        onMap: true,
      }
    );
  }, [hoveredRegion, mapData]);

  const selectedData = useMemo(() => {
    if (!selectedRegion || !mapData) return null;
    return (
      mapData.regions[selectedRegion] || {
        name: selectedRegion,
        svgId: null,
        onMap: true,
      }
    );
  }, [selectedRegion, mapData]);

  const selectedColumnDef = useMemo(() => {
    return currentColumns.find((c) => c.key === selectedColumn) || null;
  }, [currentColumns, selectedColumn]);

  // Sidebar bar chart data
  const sidebarChartData = useMemo(() => {
    if (!selectedData || !mapData || !selectedRegion) return [];
    return mapData.indicators.map((ind) => {
      const shareKey = ind.columns.find((c) =>
        c.label.toLowerCase().includes("доля")
      )?.key;
      const coeffKey = ind.columns.find((c) =>
        c.label.toLowerCase().includes("коэффициент")
      )?.key;
      const key = coeffKey || shareKey;
      const rawVal = key
        ? (selectedData[key] as number | null | undefined) ??
          ind.data[selectedRegion]?.[key]
        : null;
      const keyColumn = key ? ind.columns.find((c) => c.key === key) : null;
      const val = normalizeValue(
        rawVal as number | null,
        ind.key,
        keyColumn || null
      );
      return {
        name: ind.label.replace(/\d{4}/g, "").trim(),
        value: val && typeof val === "number" ? val : null,
        shortLabel: ind.label,
      };
    });
  }, [selectedData, mapData, selectedRegion]);

  const CHART_COLORS = ["#e94560", "#4caf50", "#ff9800", "#2196f3"];

  const legendItems = useMemo(() => {
    const isPercent = selectedColumnDef
      ? isPercentColumn(selectedColumnDef.label, selectedColumnDef.key)
      : false;
    const bins = Math.max(1, currentScale.length - 1);
    return Array.from({ length: bins }).map((_, i) => ({
      color: BLUE_SHADES[i],
      from: currentScale[i],
      to: currentScale[i + 1],
      suffix: isPercent ? "%" : "",
    }));
  }, [currentScale, selectedColumnDef]);

  // Reset pan/zoom on indicator change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [selectedIndicator]);

  // Handle indicator change
  const handleIndicatorChange = useCallback(
    (value: string) => {
      setSelectedIndicator(value);
      const ind = mapData?.indicators.find((i) => i.key === value);
      if (ind) {
        // Default to share column, or first numeric column
        const shareCol = ind.columns.find((c) =>
          c.label.toLowerCase().includes("доля")
        );
        const coeffCol = ind.columns.find((c) =>
          c.label.toLowerCase().includes("коэффициент")
        );
        setSelectedColumn(
          coeffCol?.key || shareCol?.key || ind.columns[0]?.key
        );
      }
    },
    [mapData]
  );

  // Zoom handlers - use ref for non-passive wheel event
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(8, prev + delta)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Prioritize selecting regions: don't start panning on region click.
      const regionTarget = (e.target as Element).closest("[data-region]");
      if (regionTarget) return;
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const getRegionFromEvent = useCallback((e: React.MouseEvent): string | null => {
    let region =
      (e.target as Element)
        .closest("[data-region]")
        ?.getAttribute("data-region") || null;

    if ((!region || region === "unknown") && e.nativeEvent.composedPath) {
      const path = e.nativeEvent.composedPath();
      for (const node of path) {
        if (node instanceof Element) {
          const val = node.getAttribute("data-region");
          if (val && val !== "unknown") {
            region = val;
            break;
          }
        }
      }
    }

    if (!region || region === "unknown") {
      const pointEl = document.elementFromPoint(e.clientX, e.clientY);
      region =
        pointEl?.closest("[data-region]")?.getAttribute("data-region") || null;
    }

    return region && region !== "unknown" ? region : null;
  }, []);

  // SVG hover/click handlers
  const handlePathMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      const region = getRegionFromEvent(e);
      if (region) {
        setHoveredRegion(region);
        setShowTooltip(true);
      }
    },
    [getRegionFromEvent]
  );

  const handlePathMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const region = getRegionFromEvent(e);
      if (region) {
        if (hoveredRegion !== region) {
          setHoveredRegion(region);
        }
        if (!showTooltip) {
          setShowTooltip(true);
        }
      } else if (showTooltip) {
        setHoveredRegion(null);
        setShowTooltip(false);
      }

      if (showTooltip) {
        const rect = mapContainerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltipPos({
            x: e.clientX - rect.left + 16,
            y: e.clientY - rect.top + 16,
          });
        }
      }
    },
    [getRegionFromEvent, hoveredRegion, showTooltip]
  );

  const handlePathMouseLeave = useCallback(() => {
    setHoveredRegion(null);
    setShowTooltip(false);
  }, []);

  const handlePathClick = useCallback(
    (e: React.MouseEvent) => {
      const region = getRegionFromEvent(e);
      if (region) {
        setSelectedRegion((prev) => (prev === region ? null : region));
      }
    },
    [getRegionFromEvent]
  );

  // Export to PNG
  const handleExport = useCallback(async () => {
    if (!exportRef.current) return;
    try {
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: "#0f172a",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `russia-metallurgy-${selectedIndicator}-${selectedColumn}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [selectedIndicator, selectedColumn]);

  // Process SVG content with blue shades and interactivity
  const processedSvg = useMemo(() => {
    if (!svgContent || !mapData || !currentIndicator) return null;

    // The SVG file is pre-cleaned (no namespace prefixes), parse directly
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgEl = doc.documentElement;

    // Set SVG attributes
    svgEl.setAttribute("width", "100%");
    svgEl.setAttribute("height", "100%");

    // Remove existing defs
    const existingDefs = svgEl.querySelector("defs");
    if (existingDefs) existingDefs.remove();

    // Remove metadata, namedview, and other non-visual elements
    const metadata = svgEl.querySelector("metadata");
    if (metadata) metadata.remove();
    svgEl.querySelectorAll("[id=\"namedview121\"]").forEach((el) => el.remove());
    // Remove the star group (decorative element)
    svgEl.querySelectorAll("[id=\"star\"]").forEach((el) => el.remove());

    // Attach region names to city marker elements (Moscow/SPB/Sevastopol).
    Object.entries(CITY_MARKER_REGION_BY_ID).forEach(([id, regionName]) => {
      const marker = svgEl.querySelector(`[id="${id}"]`);
      if (marker) {
        marker.setAttribute("data-region", regionName);
      }
    });

    // Disable pointer events on non-region geometry.
    const allShapes = svgEl.querySelectorAll(
      "path,circle,ellipse,polygon,polyline,rect"
    );
    allShapes.forEach((shape) => {
      if (!shape.getAttribute("data-region")) {
        shape.setAttribute("pointer-events", "none");
      }
    });

    // Process all region shapes with data-region attributes.
    const regionShapes = svgEl.querySelectorAll(
      "path[data-region],circle[data-region],ellipse[data-region],polygon[data-region],polyline[data-region],rect[data-region]"
    );
    regionShapes.forEach((shape) => {
      const region = shape.getAttribute("data-region");
      if (region === "unknown" || !region) return;

      const rawValue = currentIndicator.data[region]?.[selectedColumn];
      const normalizedValue = normalizeValue(
        rawValue as number | null,
        currentIndicator.key,
        selectedColumnDef
      );
      const level = classifyValue(normalizedValue, currentScale);

      const fillColor =
        normalizedValue === null || normalizedValue === undefined
          ? NO_DATA_FILL
          : BLUE_SHADES[level] || BLUE_SHADES[0];

      shape.setAttribute("fill", fillColor);
      shape.setAttribute("stroke", STROKE_COLOR);
      shape.setAttribute("stroke-width", selectedRegion === region ? "1.9" : "1");
      shape.setAttribute(
        "stroke-opacity",
        selectedRegion === region ? "1" : "0.65"
      );
      shape.setAttribute("pointer-events", "all");
      // Remove Inkscape style attributes that may override
      shape.removeAttribute("style");

      shape.classList.add("map-region");
      (shape as SVGElement).style.cursor = "pointer";
    });

    // Remove title elements (they can cause tooltips)
    const titles = svgEl.querySelectorAll("title");
    titles.forEach((t) => t.remove());

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgEl);
  }, [
    svgContent,
    mapData,
    currentIndicator,
    selectedColumn,
    selectedColumnDef,
    currentScale,
    selectedRegion,
  ]);

  // All regions in alphabetical order (89 rows)
  const regionsAlphabetical = useMemo(() => {
    if (!mapData || !currentIndicator) return [];
    return Object.values(mapData.regions)
      .map((r) => {
        const val =
          currentIndicator.data[r.name]?.[selectedColumn] ??
          (r[selectedColumn] as number | null | undefined) ??
          null;
        return { name: r.name, value: val };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
      );
  }, [mapData, currentIndicator, selectedColumn]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">
            Загрузка карты России...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!mapData || !processedSvg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">Ошибка загрузки данных</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">
                Металлургия России
              </h1>
              <p className="text-xs text-muted-foreground">
                Интерактивная карта по субъектам РФ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={selectedIndicator}
              onValueChange={handleIndicatorChange}
            >
              <SelectTrigger className="w-[260px] bg-card/80 border-border/50">
                <Layers className="w-4 h-4 mr-1 text-primary" />
                <SelectValue placeholder="Выберите показатель" />
              </SelectTrigger>
              <SelectContent>
                {mapData.indicators.map((ind) => (
                  <SelectItem key={ind.key} value={ind.key}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger className="w-[240px] bg-card/80 border-border/50">
                <BarChart3 className="w-4 h-4 mr-1 text-primary" />
                <SelectValue placeholder="Выберите параметр" />
              </SelectTrigger>
              <SelectContent>
                {currentColumns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="bg-card/80 border-border/50"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">PNG</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex relative">
        {/* Map Area */}
        <div
          ref={mapContainerRef}
          className="flex-1 relative overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
        >
          {/* Export surface: includes title + map + legend */}
          <div ref={exportRef} className="absolute inset-0 bg-[#0f172a]">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <Card className="bg-card/90 backdrop-blur-sm border-border/50 py-2 px-4 shadow-lg">
                <CardContent className="p-0 text-center">
                  <p className="text-xs font-semibold text-foreground">
                    {currentIndicator?.label || "Металлургия России"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedColumnDef?.label || "Показатель"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Map SVG */}
            <div
              ref={mapRef}
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isPanning ? "none" : "transform 0.1s ease-out",
              }}
              dangerouslySetInnerHTML={{ __html: processedSvg }}
              onMouseEnter={handlePathMouseEnter}
              onMouseMove={handlePathMouseMove}
              onMouseLeave={handlePathMouseLeave}
              onClick={handlePathClick}
            />

            {/* Legend */}
            <div className="absolute bottom-4 left-20 sm:left-24 md:left-28 z-10 pointer-events-none">
              <Card className="bg-card/90 backdrop-blur-sm border-border/50 py-3 px-4 shadow-lg">
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground mb-2 text-center font-medium">
                    {selectedColumnDef?.label || "Показатель"}
                  </p>
                  <div className="flex items-center gap-1">
                    {legendItems.map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div
                          className="w-[36px] h-[24px] rounded border border-border/30"
                          style={{ background: item.color }}
                        />
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                          {`${item.from}-${item.to}${item.suffix}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
            <Button
              variant="outline"
              size="icon"
              className="bg-card/90 border-border/50 backdrop-blur-sm"
              onClick={() => setZoom((z) => Math.min(8, z + 0.5))}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-card/90 border-border/50 backdrop-blur-sm"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-card/90 border-border/50 backdrop-blur-sm"
              onClick={resetZoom}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Tooltip */}
          <AnimatePresence>
            {showTooltip && hoveredData && hoveredRegion && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute z-50 pointer-events-none max-w-xs"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                }}
              >
                <Card className="bg-card/95 backdrop-blur-md border-border/70 shadow-xl py-2 px-3">
                  <CardContent className="p-0">
                    <p className="font-semibold text-sm text-foreground mb-1.5">
                      {hoveredData.name}
                    </p>
                    {currentIndicator &&
                      currentColumns.map((col) => {
                        const val =
                          currentIndicator.data[hoveredRegion]?.[col.key];
                        return (
                          <div
                            key={col.key}
                            className="flex justify-between items-center gap-4 text-xs"
                          >
                            <span className="text-muted-foreground truncate">
                              {col.label}
                            </span>
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {formatColumnValue(
                                val as number | null,
                                currentIndicator.key,
                                col
                              )}
                            </span>
                          </div>
                        );
                      })}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {selectedRegion && selectedData && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="border-l border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden flex-shrink-0"
            >
              <div className="w-[360px] h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold text-sm text-foreground truncate max-w-[280px]">
                      {selectedData.name}
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSelectedRegion(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Bar chart across indicators */}
                    <Card className="bg-background/60 border-border/30 py-3">
                      <CardHeader className="pb-2 px-4">
                        <CardTitle className="text-xs text-muted-foreground">
                          Сравнение по показателям
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4">
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={sidebarChartData.filter(
                                (d) => d.value !== null
                              )}
                              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(255,255,255,0.05)"
                              />
                              <XAxis
                                dataKey="shortLabel"
                                tick={{ fontSize: 8, fill: "#94a3b8" }}
                                angle={-20}
                                textAnchor="end"
                                height={50}
                              />
                              <YAxis
                                tick={{ fontSize: 9, fill: "#94a3b8" }}
                                tickFormatter={(v) => `${v.toFixed(1)}`}
                                width={45}
                              />
                              <RechartsTooltip
                                formatter={(value: number) => [
                                  `${value.toFixed(2)}`,
                                  "Значение",
                                ]}
                                contentStyle={{
                                  backgroundColor: "#1e293b",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                }}
                              />
                              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {sidebarChartData.map((_, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* All indicator data for selected region */}
                    {mapData.indicators.map((ind) => (
                      <Card
                        key={ind.key}
                        className="bg-background/60 border-border/30 py-3"
                      >
                        <CardHeader className="pb-2 px-4">
                          <CardTitle className="text-xs text-muted-foreground">
                            {ind.label}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 space-y-1.5">
                          {ind.columns.map((col) => {
                            const val =
                              (selectedData[col.key] as number | null | undefined) ??
                              ind.data[selectedRegion]?.[col.key] ??
                              null;
                            return (
                              <div
                                key={col.key}
                                className="flex justify-between items-center gap-3 text-xs"
                              >
                                <span className="text-muted-foreground text-right truncate">
                                  {col.label}
                                </span>
                                <span className="font-medium text-foreground whitespace-nowrap">
                                  {formatColumnValue(
                                    val as number | null,
                                    ind.key,
                                    col
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    ))}

                    {/* SVG Info */}
                    {!selectedData.onMap && (
                      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg p-3">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>
                          Этот регион не отображается на карте как отдельный
                          субъект
                        </span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom region list */}
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              {`Все регионы (${regionsAlphabetical.length}):`}
            </span>
            {regionsAlphabetical.map((r) => {
              const displayVal = formatColumnValue(
                r.value,
                currentIndicator?.key,
                selectedColumnDef
              );
              return (
                <button
                  key={r.name}
                  onClick={() => setSelectedRegion(r.name)}
                  className={`text-xs px-2 py-1 rounded-md flex-shrink-0 transition-colors ${
                    selectedRegion === r.name
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {r.name}
                  <span className="ml-1 opacity-70">({displayVal})</span>
                </button>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}
