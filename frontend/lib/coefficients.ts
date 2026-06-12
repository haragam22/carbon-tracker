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
