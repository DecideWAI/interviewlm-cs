'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Info } from 'lucide-react';
import Link from 'next/link';

interface Variant {
  id: string;
  name: string;
  backend: 'claude-sdk' | 'langgraph';
  weight: number;
  config: Record<string, string>;
}

export default function NewExperimentPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trafficPercentage, setTrafficPercentage] = useState(10);
  const [primaryMetric, setPrimaryMetric] = useState('response_latency_ms');
  const [variants, setVariants] = useState<Variant[]>([
    {
      id: 'var_1',
      name: 'Control (Claude SDK)',
      backend: 'claude-sdk',
      weight: 50,
      config: {},
    },
    {
      id: 'var_2',
      name: 'Treatment (LangGraph)',
      backend: 'langgraph',
      weight: 50,
      config: {},
    },
  ]);

  const addVariant = () => {
    const newVariant: Variant = {
      id: `var_${Date.now()}`,
      name: `Variant ${variants.length + 1}`,
      backend: 'claude-sdk',
      weight: 0,
      config: {},
    };
    setVariants([...variants, newVariant]);
  };

  const removeVariant = (id: string) => {
    if (variants.length <= 2) return;
    setVariants(variants.filter((v) => v.id !== id));
  };

  const updateVariant = (id: string, updates: Partial<Variant>) => {
    setVariants(
      variants.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate weights sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      alert('Variant weights must sum to 100%');
      return;
    }

    // TODO: Call API to create experiment
    console.log({
      name,
      description,
      trafficPercentage,
      primaryMetric,
      variants,
    });

    router.push('/experiments');
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/experiments"
          className="inline-flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Experiments
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary">
          Create New Experiment
        </h1>
        <p className="text-text-tertiary mt-1">
          Set up an A/B test between agent backends
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-background-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-medium text-text-primary mb-4">
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Experiment Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Agent Backend Comparison"
                className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this experiment..."
                rows={3}
                className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Traffic & Metrics */}
        <div className="bg-background-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-medium text-text-primary mb-4">
            Traffic & Metrics
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Traffic Allocation
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={trafficPercentage}
                  onChange={(e) => setTrafficPercentage(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="w-20 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none"
                />
                <span className="text-text-tertiary">% of eligible traffic</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Primary Metric
              </label>
              <select
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value)}
                className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="response_latency_ms">Response Latency</option>
                <option value="error_rate">Error Rate</option>
                <option value="completion_rate">Completion Rate</option>
                <option value="token_usage">Token Usage</option>
                <option value="user_satisfaction">User Satisfaction</option>
              </select>
            </div>
          </div>
        </div>

        {/* Variants */}
        <div className="bg-background-secondary border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary">Variants</h2>
            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover"
            >
              <Plus className="h-4 w-4" />
              Add Variant
            </button>
          </div>

          <div className="space-y-4">
            {variants.map((variant, index) => (
              <div
                key={variant.id}
                className="bg-background-tertiary border border-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 mr-4">
                    <input
                      type="text"
                      value={variant.name}
                      onChange={(e) =>
                        updateVariant(variant.id, { name: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      placeholder="Variant name"
                    />
                  </div>
                  {variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(variant.id)}
                      className="p-2 text-text-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-tertiary mb-1">
                      Backend
                    </label>
                    <select
                      value={variant.backend}
                      onChange={(e) =>
                        updateVariant(variant.id, {
                          backend: e.target.value as 'claude-sdk' | 'langgraph',
                        })
                      }
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none text-sm"
                    >
                      <option value="claude-sdk">Claude SDK (TypeScript)</option>
                      <option value="langgraph">LangGraph (Python)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-tertiary mb-1">
                      Weight
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={variant.weight}
                        onChange={(e) =>
                          updateVariant(variant.id, {
                            weight: Number(e.target.value),
                          })
                        }
                        min={0}
                        max={100}
                        className="w-20 px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none text-sm"
                      />
                      <span className="text-text-tertiary text-sm">%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Weight validation */}
          {(() => {
            const total = variants.reduce((sum, v) => sum + v.weight, 0);
            if (total !== 100) {
              return (
                <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2 text-sm text-warning">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  Weights must sum to 100% (currently {total}%)
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/experiments"
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            Create Experiment
          </button>
        </div>
      </form>
    </div>
  );
}
