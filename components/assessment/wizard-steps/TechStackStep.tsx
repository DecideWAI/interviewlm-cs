"use client";

import { useState, useEffect } from "react";
import {
  AssessmentConfig,
  Technology,
  TechStackRequirements,
  TechPriority,
} from "@/types/assessment";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";
import { TECH_STACK_PRESETS } from "@/lib/tech-catalog"; // Keep presets for now, or move to API later

interface TechStackStepProps {
  config: Partial<AssessmentConfig>;
  onUpdate: (updates: Partial<AssessmentConfig>) => void;
  errors: Record<string, string>;
}

export function TechStackStep({ config, onUpdate, errors }: TechStackStepProps) {
  const [selectedTech, setSelectedTech] = useState<TechStackRequirements>(
    config.techStackRequirements || {
      critical: [],
      required: [],
      recommended: [],
      optional: [],
    }
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("language");
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [loading, setLoading] = useState(true);

  // Identify primary language from critical list
  const primaryLanguage = selectedTech.critical.find(
    (t) => t.category === "language"
  );

  useEffect(() => {
    async function fetchTechnologies() {
      setLoading(true);
      try {
        const response = await fetch("/api/technologies");
        if (response.ok) {
          const data = await response.json();
          setTechnologies(data);
        } else {
          console.error("Failed to fetch technologies");
        }
      } catch (error) {
        console.error("Error fetching technologies:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTechnologies();
  }, []);

  const getIconComponent = (iconName?: string): LucideIcon => {
    if (!iconName) return Icons.Circle;
    return (Icons as any)[iconName] || Icons.Circle;
  };

  const handleTechToggle = (tech: Technology, priority: TechPriority) => {
    const newTechStack = { ...selectedTech };

    // Remove from all priority levels first
    newTechStack.critical = newTechStack.critical.filter((t) => t.id !== tech.id);
    newTechStack.required = newTechStack.required.filter((t) => t.id !== tech.id);
    newTechStack.recommended = newTechStack.recommended.filter((t) => t.id !== tech.id);
    newTechStack.optional = newTechStack.optional.filter((t) => t.id !== tech.id);

    // Check if already selected at this priority level
    const isSelected = selectedTech[priority].some((t) => t.id === tech.id);

    if (!isSelected) {
      // Special handling for Primary Language
      if (tech.category === "language" && priority === "critical") {
        // Remove other languages from critical to enforce single primary language
        newTechStack.critical = newTechStack.critical.filter(
          (t) => t.category !== "language"
        );
      }
      // Add to the selected priority level
      newTechStack[priority] = [...newTechStack[priority], tech];
    }

    setSelectedTech(newTechStack);
    onUpdate({ techStackRequirements: newTechStack });
  };

  const isTechSelected = (techId: string): TechPriority | null => {
    if (selectedTech.critical.some((t) => t.id === techId)) return "critical";
    if (selectedTech.required.some((t) => t.id === techId)) return "required";
    if (selectedTech.recommended.some((t) => t.id === techId)) return "recommended";
    if (selectedTech.optional.some((t) => t.id === techId)) return "optional";
    return null;
  };

  const applyPreset = (presetKey: string) => {
    const preset = TECH_STACK_PRESETS[presetKey as keyof typeof TECH_STACK_PRESETS];
    if (!preset) return;

    const newTechStack: TechStackRequirements = {
      critical: preset.critical,
      required: preset.required,
      recommended: preset.recommended,
      optional: preset.optional,
    };

    setSelectedTech(newTechStack);
    onUpdate({ techStackRequirements: newTechStack });
  };

  const getPriorityBadge = (priority: TechPriority) => {
    switch (priority) {
      case "critical":
        return "destructive";
      case "required":
        return "default";
      case "recommended":
        return "secondary";
      case "optional":
        return "outline";
    }
  };

  const renderTechnologyCard = (tech: Technology) => {
    const selectedPriority = isTechSelected(tech.id);
    const IconComponent = getIconComponent(tech.icon);

    return (
      <div
        key={tech.id}
        className={`
          relative group flex flex-col p-3 rounded-xl border transition-all cursor-pointer
          ${selectedPriority
            ? "border-primary/50 bg-primary/5 shadow-sm"
            : "border-border hover:border-primary/30 hover:shadow-md bg-card"
          }
        `}
        onClick={() => {
          if (!selectedPriority) {
            // Default priority based on category
            const defaultPriority = tech.category === "language" ? "critical" : "required";
            handleTechToggle(tech, defaultPriority);
          }
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${tech.color}20`, color: tech.color }}
          >
            <IconComponent className="h-5 w-5" />
          </div>
          {selectedPriority && (
            <Badge variant={getPriorityBadge(selectedPriority)} className="text-[10px] uppercase">
              {selectedPriority}
            </Badge>
          )}
        </div>

        <h4 className="font-medium text-sm text-foreground mb-1">{tech.name}</h4>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {tech.description}
        </p>

        {/* Priority Selection (Visible on hover or if selected) */}
        <div className={`
          mt-auto pt-2 border-t border-border/50 flex gap-1 justify-between
          ${selectedPriority ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
          transition-opacity
        `}>
          <button
            onClick={(e) => { e.stopPropagation(); handleTechToggle(tech, "critical"); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors ${selectedPriority === 'critical' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
            title="Critical"
          >
            C
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleTechToggle(tech, "required"); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors ${selectedPriority === 'required' ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
            title="Required"
          >
            R
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleTechToggle(tech, "recommended"); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors ${selectedPriority === 'recommended' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            title="Recommended"
          >
            M
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleTechToggle(tech, "optional"); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors ${selectedPriority === 'optional' ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            title="Optional"
          >
            O
          </button>
          {selectedPriority && (
            <button
              onClick={(e) => { e.stopPropagation(); handleTechToggle(tech, selectedPriority); }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-gray-100 text-gray-500 hover:bg-gray-200"
              title="Remove"
            >
              <Icons.X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Filter frameworks based on primary language
  const filteredFrameworks = technologies.filter((t) => {
    if (t.category !== "framework") return false;
    if (!primaryLanguage) return true; // Show all if no language selected
    return primaryLanguage.commonlyPairedWith?.includes(t.id);
  });

  const categories = [
    { id: "language", name: "Languages", icon: Icons.Code2, count: technologies.filter(t => t.category === "language").length },
    { id: "framework", name: "Frameworks", icon: Icons.Layers, count: filteredFrameworks.length },
    { id: "database", name: "Databases", icon: Icons.Database, count: technologies.filter(t => t.category === "database").length },
    { id: "testing", name: "Testing", icon: Icons.TestTube, count: technologies.filter(t => t.category === "testing").length },
    { id: "tool", name: "Tools", icon: Icons.Wrench, count: technologies.filter(t => t.category === "tool").length },
  ];

  const totalSelected =
    selectedTech.critical.length +
    selectedTech.required.length +
    selectedTech.recommended.length +
    selectedTech.optional.length;

  if (loading) {
    return <div className="p-8 text-center">Loading technologies...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Technology Stack
          </h3>
          <p className="text-sm text-muted-foreground">
            Select the technologies required for this role.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search technologies..."
            className="w-[200px] h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground py-1">Quick Presets:</span>
        {Object.entries(TECH_STACK_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => applyPreset(key)}
          >
            {preset.name}
          </Button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Category Sidebar */}
        <div className="w-full lg:w-48 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${activeCategory === cat.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background hover:bg-muted text-muted-foreground"
                }
              `}
            >
              <cat.icon className="h-4 w-4" />
              {cat.name}
              <span className={`ml-auto text-xs ${activeCategory === cat.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Main Selection Area */}
        <div className="flex-1 min-h-[400px]">
          {/* Primary Language Warning */}
          {activeCategory === "framework" && !primaryLanguage && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-sm text-yellow-800">
              <Icons.AlertTriangle className="h-4 w-4" />
              Select a Primary Language first to see relevant frameworks.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {activeCategory === "framework"
              ? filteredFrameworks
                .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(renderTechnologyCard)
              : technologies
                .filter(t => t.category === activeCategory)
                .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(renderTechnologyCard)
            }
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      {totalSelected > 0 && (
        <Card className="bg-muted/30 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icons.CheckCircle2 className="h-5 w-5 text-green-600" />
              Selected Stack ({totalSelected})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["critical", "required", "recommended", "optional"].map((priority) => {
                const items = selectedTech[priority as TechPriority];
                if (items.length === 0) return null;

                return (
                  <div key={priority} className="flex items-start gap-3">
                    <div className={`w-24 flex-shrink-0 text-xs font-semibold uppercase py-1 ${priority === 'critical' ? 'text-red-600' :
                        priority === 'required' ? 'text-orange-600' :
                          priority === 'recommended' ? 'text-blue-600' : 'text-green-600'
                      }`}>
                      {priority}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map(tech => (
                        <Badge key={tech.id} variant="default" className="bg-background border border-border text-foreground">
                          {tech.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {errors.techStack && (
        <p className="text-sm text-destructive">{errors.techStack}</p>
      )}
    </div>
  );
}
