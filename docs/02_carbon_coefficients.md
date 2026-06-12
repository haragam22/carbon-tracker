# 02 — Carbon Coefficients & Emission Math
## Carbon Impact Platform — O(1) Static Hash Map Reference

---

## 1. Design Principle

All emission calculations are **O(1)**: every activity unit maps directly to a pre-computed `kg CO₂e per unit` value stored in static Python dictionaries. There are **no nested loops, no conditional chains, and no database round-trips** in the hot calculation path — `calculate_emissions()` performs a fixed number of dictionary lookups and arithmetic operations regardless of input size.

Emission factors are sourced from widely-cited averages (DEFRA/EPA-style conversion factors, rounded for clarity). These are reasonable approximations suitable for an awareness tool, not a regulatory carbon audit.

---

## 2. Static Hash Maps (`backend/core/coefficients.py`)

### 2.1 Transit Emission Factors (kg CO₂e per km, per passenger)

```python
# core/coefficients.py

TRANSIT_FACTORS: dict[str, float] = {
    "car_petrol_small":   0.150,   # small petrol car, average occupancy
    "car_petrol_medium":  0.192,
    "car_petrol_large":   0.282,
    "car_diesel_medium":  0.171,
    "car_electric":       0.053,   # grid-average EV
    "motorbike":          0.103,
    "bus":                0.105,
    "metro_train":        0.041,
    "auto_rickshaw":      0.113,
    "bicycle":            0.000,
    "walking":            0.000,
}

DEFAULT_TRANSIT_MODE = "car_petrol_medium"
```

### 2.2 Food Emission Factors (kg CO₂e per meal serving)

```python
FOOD_FACTORS: dict[str, float] = {
    "beef_meal":          6.610,
    "lamb_meal":          5.890,
    "pork_meal":          2.230,
    "chicken_meal":       1.570,
    "fish_meal":          1.340,
    "egg_meal":           0.450,
    "dairy_heavy_meal":   0.890,
    "vegetarian_meal":    0.380,
    "vegan_meal":         0.190,
}

DEFAULT_MEAT_MEAL_FACTOR = FOOD_FACTORS["chicken_meal"]
DEFAULT_VEG_MEAL_FACTOR  = FOOD_FACTORS["vegetarian_meal"]
```

### 2.3 Electricity & AC Emission Factors (kg CO₂e per unit)

```python
ENERGY_FACTORS: dict[str, float] = {
    # per kWh, grid-average (India CEA baseline ~0.71 kg/kWh)
    "electricity_kwh":        0.710,

    # per hour of operation, by AC type/star rating
    "ac_1star_hourly":         1.500,
    "ac_3star_hourly":         1.100,
    "ac_5star_hourly":         0.850,
    "ac_inverter_hourly":      0.720,

    # misc household appliances (per hour), included for extensibility
    "ceiling_fan_hourly":      0.030,
    "heater_hourly":           1.200,
    "refrigerator_daily":      0.850,
}

DEFAULT_AC_FACTOR = ENERGY_FACTORS["ac_3star_hourly"]
```

---

## 3. The O(1) Calculation Function

```python
# core/coefficients.py (continued)

def calculate_emissions(
    transit_km: float,
    meat_meals: int,
    ac_hours: float,
    electricity_kwh: float,
    transit_mode: str = DEFAULT_TRANSIT_MODE,
    ac_type: str = "ac_3star_hourly",
) -> tuple[float, float]:
    """
    O(1) emission calculation.

    Performs exactly 4 dictionary lookups and a fixed sequence of
    multiplications/additions — runtime is independent of input magnitude.

    Returns:
        (total_co2_kg, emission_index)
    """

    # --- 1. Direct hash map lookups (O(1) each) ---
    transit_factor = TRANSIT_FACTORS.get(transit_mode, TRANSIT_FACTORS[DEFAULT_TRANSIT_MODE])
    meat_factor    = DEFAULT_MEAT_MEAL_FACTOR
    ac_factor      = ENERGY_FACTORS.get(ac_type, DEFAULT_AC_FACTOR)
    elec_factor    = ENERGY_FACTORS["electricity_kwh"]

    # --- 2. Component emissions (kg CO2e) ---
    transit_co2 = transit_km * transit_factor
    food_co2    = meat_meals * meat_factor
    ac_co2      = ac_hours * ac_factor
    elec_co2    = electricity_kwh * elec_factor

    total_co2_kg = round(transit_co2 + food_co2 + ac_co2 + elec_co2, 4)

    # --- 3. Normalization to [0.0, 1.0] emission index ---
    emission_index = normalize_emission_index(total_co2_kg)

    return total_co2_kg, round(emission_index, 4)
```

---

## 4. Normalization Formula (Emission Index)

The **emission index** is the single normalized value (`0.0` → pristine biosphere, `1.0` → maximum atmospheric distress) that drives:
- `islandScale` (Core color morph: vibrant green → cracked charcoal-gray)
- `vortexParticleCount` (200 → 5000)
- `vortexVelocity` (orbital angular velocity of the particle storm)

### 4.1 Baseline Constants

Based on average daily per-capita emissions data (transit + food + home energy), we define:

```python
# Calibration constants (kg CO2e per day)
EMISSION_FLOOR = 0.0      # theoretical zero-impact day
EMISSION_CEILING = 30.0   # high-impact day threshold (~heavy car commute + beef + AC)
```

### 4.2 Min-Max Normalization Formula

$$
\text{emission\_index} = \text{clamp}\left(\frac{C_{\text{total}} - C_{\text{floor}}}{C_{\text{ceiling}} - C_{\text{floor}}},\ 0.0,\ 1.0\right)
$$

Where:
- $C_{\text{total}}$ = `total_co2_kg` (sum of transit + food + AC + electricity emissions)
- $C_{\text{floor}}$ = `EMISSION_FLOOR` = 0.0
- $C_{\text{ceiling}}$ = `EMISSION_CEILING` = 30.0
- `clamp(x, lo, hi)` = $\max(\text{lo}, \min(\text{hi}, x))$

### 4.3 Implementation

```python
# core/coefficients.py (continued)

EMISSION_FLOOR = 0.0
EMISSION_CEILING = 30.0

def normalize_emission_index(total_co2_kg: float) -> float:
    """
    Min-max normalization to [0.0, 1.0].
    O(1) — single division and two comparisons.
    """
    raw = (total_co2_kg - EMISSION_FLOOR) / (EMISSION_CEILING - EMISSION_FLOOR)
    return max(0.0, min(1.0, raw))
```

---

## 5. Derived Canvas Bindings (Formulas)

These formulas convert `emission_index` ($E \in [0.0, 1.0]$) into the three Three.js render-loop parameters.

### 5.1 Particle Count

$$
N_{\text{particles}} = N_{\min} + E \times (N_{\max} - N_{\min})
$$

Where $N_{\min} = 200$, $N_{\max} = 5000$.

```python
def get_particle_count(emission_index: float) -> int:
    N_MIN, N_MAX = 200, 5000
    return int(N_MIN + emission_index * (N_MAX - N_MIN))
```

### 5.2 Vortex Angular Velocity

$$
V_{\text{vortex}} = V_{\min} + E \times (V_{\max} - V_{\min})
$$

Where $V_{\min} = 0.1$ rad/frame-unit (calm), $V_{\max} = 2.0$ (chaotic storm).

```python
def get_vortex_velocity(emission_index: float) -> float:
    V_MIN, V_MAX = 0.1, 2.0
    return round(V_MIN + emission_index * (V_MAX - V_MIN), 4)
```

### 5.3 Core Color Interpolation (Linear RGB Lerp)

The Core's material color is linearly interpolated between two RGB endpoints based on $E$:

$$
\text{Color}_{\text{core}} = \text{Color}_{\text{green}} + E \times (\text{Color}_{\text{charcoal}} - \text{Color}_{\text{green}})
$$

| Endpoint | Hex | RGB (0–1 normalized) |
|---|---|---|
| `Color_green` ($E=0.0$) | `#2ECC71` | `(0.180, 0.800, 0.443)` |
| `Color_charcoal` ($E=1.0$) | `#36454F` | `(0.212, 0.271, 0.310)` |

Per-channel formula (applied to R, G, B independently):

$$
C_{\text{channel}} = C_{\text{green}} + E \times (C_{\text{charcoal}} - C_{\text{green}})
$$

This exact formula is implemented client-side in `docs/03_canvas_blueprint.md` using `THREE.Color.lerpColors()`.

---

## 6. Complete Worked Example

**Input (POST /api/logs/daily):**
```json
{
  "transit_km": 25,
  "meat_meals": 2,
  "ac_hours": 5,
  "electricity_kwh": 8
}
```

**Step-by-step (using defaults: `car_petrol_medium`, `ac_3star_hourly`):**

| Component | Formula | Result (kg CO₂e) |
|---|---|---|
| Transit | $25 \times 0.192$ | $4.800$ |
| Food | $2 \times 1.570$ | $3.140$ |
| AC | $5 \times 1.100$ | $5.500$ |
| Electricity | $8 \times 0.710$ | $5.680$ |
| **Total** | sum | **$19.120$** |

**Emission Index:**
$$
E = \text{clamp}\left(\frac{19.120 - 0}{30 - 0}, 0, 1\right) = 0.6373
$$

**Derived bindings:**

| Parameter | Formula | Result |
|---|---|---|
| `islandScale` | $= E$ | $0.6373$ |
| `vortexParticleCount` | $200 + 0.6373 \times 4800$ | $3259$ |
| `vortexVelocity` | $0.1 + 0.6373 \times 1.9$ | $1.3109$ |
| Core color (R) | $0.180 + 0.6373 \times (0.212 - 0.180)$ | $0.2004$ |
| Core color (G) | $0.800 + 0.6373 \times (0.271 - 0.800)$ | $0.4628$ |
| Core color (B) | $0.443 + 0.6373 \times (0.310 - 0.443)$ | $0.3582$ |

**Final JSON response:**
```json
{
  "log_date": "2026-06-12",
  "total_co2_kg": 19.12,
  "emission_index": 0.6373,
  "islandScale": 0.6373,
  "vortexParticleCount": 3259,
  "vortexVelocity": 1.3109
}
```

---

## 7. Full `coefficients.py` Reference (Consolidated)

```python
# core/coefficients.py — FULL FILE

TRANSIT_FACTORS: dict[str, float] = {
    "car_petrol_small":   0.150,
    "car_petrol_medium":  0.192,
    "car_petrol_large":   0.282,
    "car_diesel_medium":  0.171,
    "car_electric":       0.053,
    "motorbike":          0.103,
    "bus":                0.105,
    "metro_train":        0.041,
    "auto_rickshaw":      0.113,
    "bicycle":            0.000,
    "walking":            0.000,
}
DEFAULT_TRANSIT_MODE = "car_petrol_medium"

FOOD_FACTORS: dict[str, float] = {
    "beef_meal":          6.610,
    "lamb_meal":          5.890,
    "pork_meal":          2.230,
    "chicken_meal":       1.570,
    "fish_meal":          1.340,
    "egg_meal":           0.450,
    "dairy_heavy_meal":   0.890,
    "vegetarian_meal":    0.380,
    "vegan_meal":         0.190,
}
DEFAULT_MEAT_MEAL_FACTOR = FOOD_FACTORS["chicken_meal"]
DEFAULT_VEG_MEAL_FACTOR  = FOOD_FACTORS["vegetarian_meal"]

ENERGY_FACTORS: dict[str, float] = {
    "electricity_kwh":        0.710,
    "ac_1star_hourly":         1.500,
    "ac_3star_hourly":         1.100,
    "ac_5star_hourly":         0.850,
    "ac_inverter_hourly":      0.720,
    "ceiling_fan_hourly":      0.030,
    "heater_hourly":           1.200,
    "refrigerator_daily":      0.850,
}
DEFAULT_AC_FACTOR = ENERGY_FACTORS["ac_3star_hourly"]

EMISSION_FLOOR = 0.0
EMISSION_CEILING = 30.0


def normalize_emission_index(total_co2_kg: float) -> float:
    raw = (total_co2_kg - EMISSION_FLOOR) / (EMISSION_CEILING - EMISSION_FLOOR)
    return max(0.0, min(1.0, raw))


def get_particle_count(emission_index: float) -> int:
    N_MIN, N_MAX = 200, 5000
    return int(N_MIN + emission_index * (N_MAX - N_MIN))


def get_vortex_velocity(emission_index: float) -> float:
    V_MIN, V_MAX = 0.1, 2.0
    return round(V_MIN + emission_index * (V_MAX - V_MIN), 4)


def calculate_emissions(
    transit_km: float,
    meat_meals: int,
    ac_hours: float,
    electricity_kwh: float,
    transit_mode: str = DEFAULT_TRANSIT_MODE,
    ac_type: str = "ac_3star_hourly",
) -> tuple[float, float]:
    transit_factor = TRANSIT_FACTORS.get(transit_mode, TRANSIT_FACTORS[DEFAULT_TRANSIT_MODE])
    meat_factor    = DEFAULT_MEAT_MEAL_FACTOR
    ac_factor      = ENERGY_FACTORS.get(ac_type, DEFAULT_AC_FACTOR)
    elec_factor    = ENERGY_FACTORS["electricity_kwh"]

    transit_co2 = transit_km * transit_factor
    food_co2    = meat_meals * meat_factor
    ac_co2      = ac_hours * ac_factor
    elec_co2    = electricity_kwh * elec_factor

    total_co2_kg = round(transit_co2 + food_co2 + ac_co2 + elec_co2, 4)
    emission_index = round(normalize_emission_index(total_co2_kg), 4)

    return total_co2_kg, emission_index
```

---

## 8. Frontend TypeScript Mirror (for client-side preview calculations)

To allow instant UI feedback (before the backend round-trip resolves), the same constants are mirrored in `frontend/lib/coefficients.ts`:

```typescript
// lib/coefficients.ts

export const TRANSIT_FACTORS: Record<string, number> = {
  car_petrol_small: 0.150,
  car_petrol_medium: 0.192,
  car_petrol_large: 0.282,
  car_diesel_medium: 0.171,
  car_electric: 0.053,
  motorbike: 0.103,
  bus: 0.105,
  metro_train: 0.041,
  auto_rickshaw: 0.113,
  bicycle: 0.0,
  walking: 0.0,
};

export const FOOD_FACTORS: Record<string, number> = {
  beef_meal: 6.610,
  lamb_meal: 5.890,
  pork_meal: 2.230,
  chicken_meal: 1.570,
  fish_meal: 1.340,
  egg_meal: 0.450,
  dairy_heavy_meal: 0.890,
  vegetarian_meal: 0.380,
  vegan_meal: 0.190,
};

export const ENERGY_FACTORS: Record<string, number> = {
  electricity_kwh: 0.710,
  ac_1star_hourly: 1.500,
  ac_3star_hourly: 1.100,
  ac_5star_hourly: 0.850,
  ac_inverter_hourly: 0.720,
  ceiling_fan_hourly: 0.030,
  heater_hourly: 1.200,
  refrigerator_daily: 0.850,
};

export const EMISSION_FLOOR = 0.0;
export const EMISSION_CEILING = 30.0;

export function normalizeEmissionIndex(totalCo2Kg: number): number {
  const raw = (totalCo2Kg - EMISSION_FLOOR) / (EMISSION_CEILING - EMISSION_FLOOR);
  return Math.max(0.0, Math.min(1.0, raw));
}

export function getParticleCount(emissionIndex: number): number {
  const N_MIN = 200, N_MAX = 5000;
  return Math.floor(N_MIN + emissionIndex * (N_MAX - N_MIN));
}

export function getVortexVelocity(emissionIndex: number): number {
  const V_MIN = 0.1, V_MAX = 2.0;
  return Number((V_MIN + emissionIndex * (V_MAX - V_MIN)).toFixed(4));
}
```

---

*End of `02_carbon_coefficients.md`. Proceed to `03_canvas_blueprint.md` for shader values, noise structures, particle vertex configuration, and the full color-interpolation implementation using `Color_green` / `Color_charcoal` defined in §5.3 above.*
