"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";

type ActivityKey = "transitKm" | "meatMeals" | "acHours" | "electricityKwh";

interface WeeklyEntry {
  date: string;
  totalCo2Kg: number;
  emissionIndex: number;
}

interface CarbonState {
  dailyInputs: Map<ActivityKey, number>;
  setDailyInput: (key: ActivityKey, value: number) => void;
  submitDailyLog: () => Promise<void>;
  
  islandScale: number;
  vortexVelocity: number;
  vortexParticleCount: number;
  emissionIndex: number;
  
  weeklyHistory: WeeklyEntry[];
  fetchWeeklyHistory: () => Promise<void>;
  
  llmApiKey: string | null;
  setLlmApiKey: (key: string | null) => void;
}

const CarbonContext = createContext<CarbonState | undefined>(undefined);

export function CarbonProvider({ children }: { children: React.ReactNode }) {
  const [dailyInputs, setDailyInputs] = useState<Map<ActivityKey, number>>(
    new Map([
      ["transitKm", 0],
      ["meatMeals", 0],
      ["acHours", 0],
      ["electricityKwh", 0],
    ])
  );
  
  const [emissionIndex, setEmissionIndex] = useState(0);
  const [islandScale, setIslandScale] = useState(0);
  const [vortexVelocity, setVortexVelocity] = useState(0.1);
  const [vortexParticleCount, setVortexParticleCount] = useState(200);
  
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyEntry[]>([]);
  const [llmApiKey, setLlmApiKey] = useState<string | null>(null);

  // Initialize the fetch wrapper's getter
  useEffect(() => {
    // Pass the state to our fetch wrapper so it can inject the Bearer token dynamically
    (window as any).__getApiKey = () => llmApiKey;
  }, [llmApiKey]);

  useEffect(() => {
    // Rehydrate from backend on mount
    const fetchDaily = async () => {
      try {
        const data = await apiClient("/api/logs/daily");
        const newMap = new Map<ActivityKey, number>();
        newMap.set("transitKm", data.transit_km || 0);
        newMap.set("meatMeals", data.meat_meals || 0);
        newMap.set("acHours", data.ac_hours || 0);
        newMap.set("electricityKwh", data.electricity_kwh || 0);
        setDailyInputs(newMap);
        setEmissionIndex(data.emission_index || 0);
        // Normally set the canvas binding state here as well if the backend returned it
      } catch (err) {
        console.error("Failed to fetch daily logs", err);
      }
    };
    fetchDaily();
  }, []);

  const setDailyInput = (key: ActivityKey, value: number) => {
    setDailyInputs(prev => {
      const newMap = new Map(prev);
      newMap.set(key, value);
      return newMap;
    });
  };

  const submitDailyLog = async () => {
    try {
      const payload = {
        transit_km: dailyInputs.get("transitKm"),
        meat_meals: dailyInputs.get("meatMeals"),
        ac_hours: dailyInputs.get("acHours"),
        electricity_kwh: dailyInputs.get("electricityKwh"),
      };
      
      const data = await apiClient("/api/logs/daily", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      
      setEmissionIndex(data.emission_index);
      setIslandScale(data.islandScale);
      setVortexVelocity(data.vortexVelocity);
      setVortexParticleCount(data.vortexParticleCount);
    } catch (err) {
      console.error("Failed to submit daily log", err);
    }
  };

  const fetchWeeklyHistory = async () => {
    try {
      const data = await apiClient("/api/history/weekly");
      if (data && data.days) {
        setWeeklyHistory(data.days.map((d: any) => ({
          date: d.log_date,
          totalCo2Kg: d.total_co2_kg,
          emissionIndex: d.emission_index
        })));
      }
    } catch (err) {
      console.error("Failed to fetch weekly history", err);
    }
  };

  return (
    <CarbonContext.Provider
      value={{
        dailyInputs,
        setDailyInput,
        submitDailyLog,
        islandScale,
        vortexVelocity,
        vortexParticleCount,
        emissionIndex,
        weeklyHistory,
        fetchWeeklyHistory,
        llmApiKey,
        setLlmApiKey,
      }}
    >
      {children}
    </CarbonContext.Provider>
  );
}

export function useCarbon() {
  const context = useContext(CarbonContext);
  if (context === undefined) {
    throw new Error("useCarbon must be used within a CarbonProvider");
  }
  return context;
}
