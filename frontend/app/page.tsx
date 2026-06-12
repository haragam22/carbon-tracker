"use client";

import React, { useState } from "react";
import { useCarbon } from "@/context/CarbonContext";
import { DeveloperSettingsDrawer } from "@/components/DeveloperSettingsDrawer";
import { CarbonCanvas } from "@/components/CarbonCanvas";

export default function Home() {
  const { dailyInputs, setDailyInput, submitDailyLog, emissionIndex } = useCarbon();
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);

  const handleCalculate = async () => {
    await submitDailyLog();
    // Keep drawer open or close it? The prompt says "smoothly return to viewport" when closed manually.
    // We can keep it open so they see the result immediately.
  };

  const r = 46 + emissionIndex * (54 - 46);
  const g = 204 + emissionIndex * (69 - 204);
  const b = 113 + emissionIndex * (79 - 113);
  const indicatorColor = `rgb(${r}, ${g}, ${b})`;

  return (
    <div className="layout-wrapper">
      {/* Sticky Top Navigation */}
      <nav className="navbar">
        <div className="nav-brand">
          <span className="logo">CarbonImpact.ai</span>
          <span className="subtitle">Awareness as an Experience</span>
        </div>
        <button 
          className="nav-settings-btn" 
          onClick={() => setIsDevSettingsOpen(!isDevSettingsOpen)}
          title="Developer Settings"
        >
          ⚙️
        </button>
      </nav>

      {/* Main Flex Container for Drawer & Page Content */}
      <div className="flex-container">
        
        {/* Left Side-Drawer Simulator */}
        <aside className={`simulator-drawer ${isSimulatorOpen ? 'drawer-open' : 'drawer-closed'}`}>
          <div className="drawer-header">
            <h2>Simulator</h2>
            <button className="close-btn" onClick={() => setIsSimulatorOpen(false)}>×</button>
          </div>
          
          <div className="drawer-body">
            <div className="emission-display">
              <h3>Global Emission Index</h3>
              <div 
                className="emission-value" 
                style={{ color: indicatorColor, textShadow: `0 0 10px rgba(${r},${g},${b},0.3)` }}
              >
                {emissionIndex.toFixed(4)}
              </div>
            </div>

            <div className="log-form">
              <h3>Daily Activities</h3>
              <div className="input-group">
                <label>Transit (km)</label>
                <input 
                  type="number" 
                  value={dailyInputs.get("transitKm") || ""} 
                  onChange={(e) => setDailyInput("transitKm", parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="input-group">
                <label>Meat Meals</label>
                <input 
                  type="number" 
                  value={dailyInputs.get("meatMeals") || ""} 
                  onChange={(e) => setDailyInput("meatMeals", parseInt(e.target.value) || 0)} 
                />
              </div>
              <div className="input-group">
                <label>AC (Hours)</label>
                <input 
                  type="number" 
                  value={dailyInputs.get("acHours") || ""} 
                  onChange={(e) => setDailyInput("acHours", parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="input-group">
                <label>Electricity (kWh)</label>
                <input 
                  type="number" 
                  value={dailyInputs.get("electricityKwh") || ""} 
                  onChange={(e) => setDailyInput("electricityKwh", parseFloat(e.target.value) || 0)} 
                />
              </div>
              <button className="btn-primary calculate-btn" onClick={handleCalculate}>
                Calculate Impact
              </button>
            </div>
          </div>
        </aside>

        {/* Main Scrollable Page Content */}
        <main className="page-content">
          <section className="hero">
            <div className="hero-text">
              <h1>Visualizing Global Carbon Debt Real-Time</h1>
              <p>
                Experience your environmental footprint like never before. Our platform transforms raw emission data into a dynamic, procedural 3D ecosystem, allowing you to instantly visualize the real-time atmospheric impact of your daily choices.
              </p>
              {!isSimulatorOpen && (
                <button className="btn-primary hero-btn" onClick={() => setIsSimulatorOpen(true)}>
                  Open Footprint Simulator
                </button>
              )}
            </div>
            <div className="hero-canvas-wrapper">
              <div 
                className={`hero-canvas-container ${isCanvasExpanded ? 'expanded-mode' : 'interactive-preview'}`}
                onClick={() => {
                  if (!isCanvasExpanded) setIsCanvasExpanded(true);
                }}
                title={!isCanvasExpanded ? "Click to expand 3D Interactive View" : undefined}
              >
                {isCanvasExpanded && (
                  <button 
                    className="close-modal-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCanvasExpanded(false);
                    }}
                  >
                    Close View
                  </button>
                )}
                <CarbonCanvas isPreview={!isCanvasExpanded} />
                {!isCanvasExpanded && (
                  <div className="preview-overlay">
                    <span>Click to Expand</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="features-section">
            <div className="feature-card">
              <h3>O(1) Calculation Matrix Complexity</h3>
              <p>Lightning fast static hash maps ensure constant time complexity for all parameter derivations, avoiding expensive database queries during realtime simulations.</p>
            </div>
            <div className="feature-card">
              <h3>Volatile In-Memory Security Isolation</h3>
              <p>Your evaluator API keys are never persisted. Our strict in-memory Context structure guarantees zero-trace token handshakes across our secure HTTPS headers.</p>
            </div>
            <div className="feature-card">
              <h3>Weekly Historical Storage Metrics</h3>
              <p>Seamlessly track and aggregate your daily footprint over a 7-day rolling window to visualize long-term trends and optimize behavioral adjustments.</p>
            </div>
          </section>
        </main>
      </div>

      {isDevSettingsOpen && <DeveloperSettingsDrawer />}
    </div>
  );
}
