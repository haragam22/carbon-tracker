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
