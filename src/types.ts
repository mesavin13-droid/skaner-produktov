export interface Nutriments {
  'energy-kcal_100g'?: number;
  'energy-kj_100g'?: number;
  energy_100g?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  sugars_100g?: number;
  'saturated-fat_100g'?: number;
  'trans-fat_100g'?: number;
  salt_100g?: number;
  sodium_100g?: number;
  fiber_100g?: number;
  calcium_100g?: number;
  magnesium_100g?: number;
  potassium_100g?: number;
  [name: string]: number | undefined;
}
export interface Product {
  source?: 'off' | 'ai-package' | 'ai-food' | 'barcode-catalog' | 'national-catalog' | 'ean-online' | 'upcitemdb' | 'foodbase' | 'manual';
  sourceUrl?: string;
  sourceNote?: string;
  cacheStatus?: 'fresh' | 'stale';
  cacheUpdatedAt?: string;
  confidence?: 'high' | 'medium' | 'low';
  aiNotes?: string;
  aiAllergens?: string[];
  calorieRange?: [number, number];
  code: string;
  name: string;
  brand: string;
  quantity: string;
  image?: string;
  ingredients: string;
  ingredientsTags: string[];
  allergensTags: string[];
  tracesTags: string[];
  additivesTags: string[];
  nutritionGrade?: string;
  novaGroup?: number;
  categoriesTags: string[];
  labelsTags: string[];
  ingredientsAnalysisTags: string[];
  servingSize: string;
  nutriments: Nutriments;
}
export interface Rating {
  score: number;
  band: 'good' | 'medium' | 'bad';
  title: string;
  summary: string;
  good: string[];
  bad: string[];
  notices: string[];
  completeness: 'full' | 'partial' | 'low';
  isWater: boolean;
}
export type Screen = 'scanner' | 'history' | 'favorites' | 'profile';
export type Allergen = 'milk' | 'peanuts' | 'nuts' | 'gluten' | 'soybeans' | 'eggs' | 'fish' | 'sesame';
export type Diet = 'none' | 'no-sugar' | 'diabetes' | 'vegetarian';
export interface Profile {
  allergens: Allergen[];
  diet: Diet;
  calories: number;
}
export interface SavedProduct { product: Product; scannedAt: number; }
