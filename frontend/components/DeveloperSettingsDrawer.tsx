"use client";

import React, { useState } from "react";
import { useCarbon } from "@/context/CarbonContext";
import { apiClient } from "@/lib/apiClient";

export function DeveloperSettingsDrawer() {
  const { llmApiKey, setLlmApiKey } = useCarbon();
  const [isOpen, setIsOpen] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");

  const handleSave = async () => {
    setStatus("verifying");
    // Temporarily set the local memory variable so the fetch wrapper can pick it up
    (window as any).__getApiKey = () => inputKey;
    
    try {
      const result = await apiClient("/api/verify", { method: "POST" });
      if (result.status === "verified") {
        setLlmApiKey(inputKey);
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      // Revert if error
      (window as any).__getApiKey = () => llmApiKey;
    }
  };

  return (
    <div className={`drawer ${isOpen ? "open" : ""}`}>
      <button className="drawer-toggle" onClick={() => setIsOpen(!isOpen)}>
        ⚙️ Settings
      </button>
      {isOpen && (
        <div className="drawer-content">
          <h3>Developer Settings</h3>
          <p className="drawer-description">
            Your key is strictly stored in volatile memory and never saved to localStorage or a database.
          </p>
          <div className="input-group">
            <label>Evaluator API Key</label>
            <input 
              type="password" 
              value={inputKey} 
              onChange={(e) => setInputKey(e.target.value)} 
              placeholder="sk-..."
              className="drawer-input"
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={handleSave} 
            disabled={status === "verifying"}
          >
            {status === "verifying" ? "Verifying..." : "Save Key"}
          </button>
          {status === "success" && <span className="status-msg success">Key stored in memory.</span>}
          {status === "error" && <span className="status-msg error">Verification failed.</span>}
        </div>
      )}
    </div>
  );
}
